/* Snake Arena - a slither-style game tuned to be fun, not frustrating.
   Public API on window.SnakeGame: start, stop, pause, resume, respawnPlayer,
   setBoost, setControl. Communicates via callbacks passed to start(). */
(function (global) {
  "use strict";

  // ---------- tunables ----------
  var WORLD_R = 3900;
  var BASE_SPEED = 2.8;
  var BOOST_MULT = 1.9;
  var TURN_RATE = 0.16;
  var START_MASS = 12;
  var MIN_MASS = 8;
  var FOOD_TARGET = 1300;
  var TARGET_POP = 28;          // total snakes incl. player
  var CLAIM_MS = 5000;          // dropped kill-food reserved for the killer
  var MAX_SEGS = 280;
  var APEX_MIN = 24000;         // size of the biggest snakes on the board
  var APEX_MAX = 27000;
  var COMBO_WINDOW = 1100;      // ms to keep an eating combo alive
  var STARS_PER_LIFE = 5;

  var NAMES = ["Aoi","Riku","Yuki","Sora","Hana","Ren","Mei","Kai","Nao","Tsuki",
    "Hina","Jin","Mio","Taki","Rui","Saki","Kira","Yuna","Ace","Momo","Leo","Nori",
    "Pixel","Coco","Boba","Mochi","Zen","Echo","Vivi","Lumi"];
  var HUES = [165, 200, 270, 320, 45, 15, 100, 230, 300, 190, 60, 340];

  // ---------- state ----------
  var canvas, ctx, dpr = 1, cw = 0, ch = 0;
  var snakes = [], foods = [], powerups = [], particles = [];
  var player = null;
  var cam = { x: 0, y: 0, zoom: 1, targetZoom: 1 };
  var input = { angle: 0, hasTarget: false, boosting: false, control: "follow",
                originX: 0, originY: 0, curX: 0, curY: 0, active: false };
  var shake = 0, shakeX = 0, shakeY = 0;
  var running = false, paused = false, rafId = 0, lastT = 0;
  var phase = "play"; // play | dying | dead
  var dyingT = 0;
  var combo = 0, comboT = 0, stars = 0;
  var cb = {};
  var lbAccum = 0, spawnQueue = [];
  var minimap, mmx;

  // ---------- helpers ----------
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hypot(x, y) { return Math.sqrt(x * x + y * y); }
  function angleDiff(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function thicknessOf(mass) { return clamp(9 + Math.sqrt(mass) * 1.5, 9, 42); }
  function segCountOf(mass) { return clamp(Math.round(12 + mass * 0.7), 12, MAX_SEGS); }
  function colorFor(hue, l) { return "hsl(" + hue + ",85%," + (l || 60) + "%)"; }

  function pickRole() { var r = Math.random(); return r < 0.45 ? "grazer" : r < 0.75 ? "roamer" : "hunter"; }

  // ---------- snake factory ----------
  function makeSnake(opts) {
    var mass = opts.mass;
    var s = {
      id: opts.id, name: opts.name, hue: opts.hue, isPlayer: !!opts.isPlayer,
      x: opts.x, y: opts.y, angle: opts.angle, targetAngle: opts.angle,
      mass: mass, speed: BASE_SPEED, speedMul: rand(0.9, 1.16),
      thickness: thicknessOf(mass), gap: thicknessOf(mass) * 0.42, segs: [], dead: false,
      boosting: false, invUntil: performance.now() + 1600,
      shieldUntil: 0, magnetUntil: 0, speedUntil: 0,
      ai: { jitter: rand(0, 6.28), role: opts.isPlayer ? "player" : pickRole(),
            goal: null, goalUntil: 0, target: null }
    };
    // Coiled start: every segment begins stacked at the head, then the body
    // uncoils/extends outward as the snake moves.
    var n = segCountOf(mass);
    for (var i = 0; i < n; i++) s.segs.push({ x: opts.x, y: opts.y });
    return s;
  }

  function spawnPos(awayFrom, minDist) {
    for (var t = 0; t < 30; t++) {
      var a = rand(0, 6.28), r = rand(WORLD_R * 0.3, WORLD_R * 0.85);
      var x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (!awayFrom || hypot(x - awayFrom.x, y - awayFrom.y) > minDist) return { x: x, y: y, a: a };
    }
    return { x: 0, y: 0, a: rand(0, 6.28) };
  }

  var idSeq = 1;
  function spawnAI(massOverride) {
    var pm = player ? player.mass : START_MASS;
    var mass;
    if (massOverride != null) {
      mass = massOverride;
    } else {
      // keep at least a few snakes bigger than the player so there's always a
      // challenge, then a broad small->giant distribution for a lively board.
      var rivals = 0;
      for (var i = 0; i < snakes.length; i++)
        if (!snakes[i].isPlayer && !snakes[i].dead && snakes[i].mass >= pm) rivals++;
      var roll = Math.random();
      if (rivals < 3) mass = Math.max(pm * rand(1.05, 1.4), rand(60, 700));
      else if (roll < 0.45) mass = rand(12, 300);
      else if (roll < 0.75) mass = rand(300, 4000);
      else if (roll < 0.92) mass = rand(4000, 15000);
      else mass = rand(15000, APEX_MAX);
    }
    mass = clamp(mass, 12, APEX_MAX);
    var p = spawnPos(player, Math.min(1000, WORLD_R * 0.32));
    var s = makeSnake({
      id: idSeq++, name: NAMES[(idSeq * 7) % NAMES.length], hue: HUES[idSeq % HUES.length],
      x: p.x, y: p.y, angle: p.a + Math.PI, mass: mass
    });
    snakes.push(s);
    return s;
  }

  // ---------- food ----------
  // claimedBy: a snake id (incl. 0 = player) reserves the food briefly so other
  // snakes won't swarm it; pass null/undefined for free-for-all food.
  function makeFood(x, y, value, hue, claimedBy) {
    var claimed = claimedBy != null && claimedBy >= 0;
    return { x: x, y: y, v: value || 1, r: 3 + (value || 1) * 0.7,
      hue: hue == null ? HUES[(Math.random() * HUES.length) | 0] : hue,
      claimedBy: claimed ? claimedBy : -1, claimUntil: claimed ? performance.now() + CLAIM_MS : 0,
      vx: 0, vy: 0, ph: rand(0, 6.28) };
  }
  function scatterFood(n) {
    for (var i = 0; i < n; i++) {
      var a = rand(0, 6.28), r = Math.sqrt(Math.random()) * WORLD_R * 0.97;
      foods.push(makeFood(Math.cos(a) * r, Math.sin(a) * r, Math.random() < 0.12 ? 3 : 1));
    }
  }
  function dropCorpse(s, claimerId) {
    var n = s.segs.length;
    for (var i = 0; i < n; i += 2) {
      var seg = s.segs[i];
      foods.push(makeFood(seg.x + rand(-6, 6), seg.y + rand(-6, 6),
        2 + Math.random() * 2, s.hue, claimerId));
    }
  }

  function makePowerup() {
    var types = ["shield", "magnet", "star", "speed"];
    var p = spawnPos(null, 0);
    powerups.push({ x: p.x, y: p.y, type: types[(Math.random() * types.length) | 0], born: performance.now(), ph: rand(0, 6.28) });
  }

  // ---------- particles ----------
  function burst(x, y, hue, count, spd) {
    for (var i = 0; i < count; i++) {
      var a = rand(0, 6.28), s = rand(spd * 0.3, spd);
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 1, decay: rand(0.02, 0.05), hue: hue, r: rand(2, 5) });
    }
  }

  // ---------- world init ----------
  function initWorld() {
    snakes = []; foods = []; powerups = []; particles = []; spawnQueue = [];
    idSeq = 1; combo = 0; comboT = 0; stars = 0;
    scatterFood(FOOD_TARGET);
    for (var i = 0; i < 6; i++) makePowerup();
    player = makeSnake({ id: 0, name: "あなた", hue: 165, isPlayer: true,
      x: 0, y: 0, angle: rand(0, 6.28), mass: START_MASS });
    player.invUntil = performance.now() + 2200;
    snakes.push(player);
    // Seed an initial leaderboard: an apex snake near 27000, falling off to
    // a long tail of small ones.
    for (var k = 0; k < TARGET_POP - 1; k++) {
      var m = (k === 0)
        ? rand(APEX_MIN, APEX_MAX)
        : clamp(rand(APEX_MIN, APEX_MAX) * Math.pow(0.72, k) * rand(0.8, 1.15), 12, APEX_MAX);
      spawnAI(m);
    }
    cam.x = player.x; cam.y = player.y; cam.zoom = cam.targetZoom = 1;
  }

  // ---------- AI ----------
  function nearestEligibleFood(s) {
    var best = null, bd = 1e9, now = performance.now();
    var perc = 360 + s.thickness * 6;
    for (var i = 0; i < foods.length; i++) {
      var f = foods[i];
      if (f.claimUntil > now && f.claimedBy !== s.id) continue; // anti-swarm: respect claims
      var dx = f.x - s.x, dy = f.y - s.y, d = dx * dx + dy * dy;
      if (d < bd && d < perc * perc) { bd = d; best = f; }
    }
    return best;
  }

  function dangerOnHeading(s, ang, look) {
    // returns how blocked this heading is (0 = clear, higher = blocked)
    var hx = s.x + Math.cos(ang) * look, hy = s.y + Math.sin(ang) * look;
    var fromC = hypot(hx, hy);
    var danger = 0;
    if (fromC > WORLD_R * 0.95) danger += (fromC - WORLD_R * 0.95) * 0.05;
    for (var i = 0; i < snakes.length; i++) {
      var o = snakes[i];
      if (o === s || o.dead) continue;
      if (hypot(o.x - s.x, o.y - s.y) > look + 260) continue;
      var step = 3;
      for (var j = 0; j < o.segs.length; j += step) {
        var seg = o.segs[j];
        var dd = hypot(seg.x - hx, seg.y - hy);
        var rad = (o.thickness + s.thickness) * 0.7 + 14;
        if (dd < rad) danger += (rad - dd) / rad;
      }
    }
    return danger;
  }

  // pick a nearby snake the hunter can plausibly threaten
  function pickPrey(s) {
    var best = null, bd = 1e9;
    for (var i = 0; i < snakes.length; i++) {
      var t = snakes[i];
      if (t === s || t.dead || t.mass > s.mass * 1.1) continue;
      var d = hypot(t.x - s.x, t.y - s.y);
      if (d < bd) { bd = d; best = t; }
    }
    return bd < 1500 ? best : null;
  }

  // choose a long-range destination so snakes traverse the whole arena
  function pickGoal(s, now) {
    var gx = null, gy = null;
    if (s.ai.role === "hunter" && Math.random() < 0.6) {
      var prey = pickPrey(s);
      if (prey) {
        var lead = 90 + Math.random() * 140;
        gx = prey.x + Math.cos(prey.angle) * lead;
        gy = prey.y + Math.sin(prey.angle) * lead;
      }
    }
    if (gx == null && s.ai.role === "grazer" && foods.length) {
      var f = foods[(Math.random() * foods.length) | 0];
      gx = f.x; gy = f.y;
    }
    if (gx == null) { // roamer / fallback: a random far point in the arena
      var a = rand(0, 6.28), r = Math.sqrt(Math.random()) * WORLD_R * 0.9;
      gx = Math.cos(a) * r; gy = Math.sin(a) * r;
    }
    s.ai.goal = { x: gx, y: gy };
    s.ai.goalUntil = now + rand(2200, 5500);
  }

  function updateAI(s, now) {
    var look = 60 + s.thickness * 3 + (s.boosting ? 80 : 0);
    var straight = dangerOnHeading(s, s.angle, look);
    var desired;

    if (straight > 0.25) {
      // obstacle ahead: steer toward the clearer side
      var probe = 0.5;
      var left = dangerOnHeading(s, s.angle - probe, look);
      var right = dangerOnHeading(s, s.angle + probe, look);
      desired = s.angle + (left < right ? -probe : probe) * (1 + straight);
      s.boosting = false;
    } else {
      if (!s.ai.goal || now > s.ai.goalUntil) pickGoal(s, now);
      var g = s.ai.goal;
      if (hypot(g.x - s.x, g.y - s.y) < 200) { pickGoal(s, now); g = s.ai.goal; }
      desired = Math.atan2(g.y - s.y, g.x - s.x);
      // graze food encountered en route
      var f = nearestEligibleFood(s);
      if (f && hypot(f.x - s.x, f.y - s.y) < 240) desired = Math.atan2(f.y - s.y, f.x - s.x);
      // organic weave
      desired += Math.sin(now / 700 + s.ai.jitter) * 0.18;
      // peel away from the wall
      if (hypot(s.x, s.y) > WORLD_R * 0.86) { desired = Math.atan2(-s.y, -s.x); s.ai.goal = null; }
      // hunters dash across the field in bursts
      s.boosting = s.ai.role === "hunter" && s.mass > 40 && Math.sin(now / 600 + s.id) > 0.6;
    }
    s.targetAngle = desired;
  }

  // ---------- physics ----------
  function stepSnake(s, now, dt) {
    if (s.dead) return;
    if (!s.isPlayer) updateAI(s, now);

    var maxTurn = TURN_RATE * (1 + 8 / s.thickness);
    var d = angleDiff(s.targetAngle, s.angle);
    s.angle += clamp(d, -maxTurn, maxTurn) * dt;

    var sp = BASE_SPEED * s.speedMul * (1 - clamp(s.mass / 9000, 0, 0.34));
    if (now < s.speedUntil) sp *= 1.4;
    var boosting = s.boosting && s.mass > MIN_MASS + 4;
    if (boosting) {
      sp *= BOOST_MULT;
      s.mass -= 0.05 * dt;
      if (Math.random() < 0.18) {
        var tail = s.segs[s.segs.length - 1];
        foods.push(makeFood(tail.x, tail.y, 1, s.hue)); // free-for-all
      }
    }
    s.speed = sp;
    s.x += Math.cos(s.angle) * sp * dt;
    s.y += Math.sin(s.angle) * sp * dt;

    // keep derived sizes & segment count in sync with mass
    s.thickness = thicknessOf(s.mass);
    s.gap = s.thickness * 0.42;
    var want = segCountOf(s.mass);
    while (s.segs.length < want) { var last = s.segs[s.segs.length - 1]; s.segs.push({ x: last.x, y: last.y }); }
    while (s.segs.length > want) s.segs.pop();

    // chain follow
    s.segs[0].x = s.x; s.segs[0].y = s.y;
    for (var i = 1; i < s.segs.length; i++) {
      var a = s.segs[i - 1], b = s.segs[i];
      var dx = a.x - b.x, dy = a.y - b.y, dist = hypot(dx, dy);
      if (dist > s.gap) { var t = (dist - s.gap) / dist; b.x += dx * t; b.y += dy * t; }
    }
  }

  function eatFood(s, now) {
    var head = s.segs[0];
    var eatR = s.thickness * 0.6 + 8;
    var magnet = now < s.magnetUntil;
    for (var i = foods.length - 1; i >= 0; i--) {
      var f = foods[i];
      var dx = head.x - f.x, dy = head.y - f.y, d = hypot(dx, dy);
      if (magnet && d < 220) { f.x += dx / d * 5; f.y += dy / d * 5; }
      if (d < eatR + f.r) {
        s.mass += f.v;
        foods.splice(i, 1);
        if (s.isPlayer) {
          burst(f.x, f.y, f.hue, 5, 3);
          combo++; comboT = COMBO_WINDOW;
          if (combo >= 3 && cb.onCombo) cb.onCombo(combo);
          SFX.eat(combo);
        } else {
          burst(f.x, f.y, f.hue, 2, 2);
        }
      }
    }
  }

  function collectPowerups(s, now) {
    if (!s.isPlayer) return;
    var head = s.segs[0];
    for (var i = powerups.length - 1; i >= 0; i--) {
      var p = powerups[i];
      if (hypot(head.x - p.x, head.y - p.y) < s.thickness * 0.6 + 22) {
        powerups.splice(i, 1);
        applyPowerup(s, p.type, now);
        burst(p.x, p.y, 50, 16, 5);
        shake = Math.max(shake, 6);
      }
    }
  }
  function applyPowerup(s, type, now) {
    if (type === "shield") { s.shieldUntil = now + 6000; SFX.powerup(); if (cb.onPower) cb.onPower("🛡 シールド"); }
    else if (type === "magnet") { s.magnetUntil = now + 8000; SFX.powerup(); if (cb.onPower) cb.onPower("🧲 マグネット"); }
    else if (type === "speed") { s.speedUntil = now + 5000; SFX.powerup(); if (cb.onPower) cb.onPower("⚡ スピード"); }
    else if (type === "star") {
      stars++; SFX.powerup();
      if (stars >= STARS_PER_LIFE) { stars = 0; SFX.life(); if (cb.onEarnLife) cb.onEarnLife(); if (cb.onPower) cb.onPower("❤ ライフ +1"); }
      else if (cb.onPower) cb.onPower("⭐ " + stars + "/" + STARS_PER_LIFE);
    }
  }

  function killSnake(s, killerId, now) {
    if (s.dead) return;
    s.dead = true;
    // reserve the corpse for whoever made the kill (anti-swarm); -1/boundary = free
    dropCorpse(s, killerId >= 0 ? killerId : null);
    burst(s.x, s.y, s.hue, 26, 7);
    if (s.isPlayer) {
      SFX.death();
      phase = "dying"; dyingT = 900; shake = 18;
    } else {
      if (killerId === 0) { // player kill
        SFX.kill(); shake = Math.max(shake, 10);
        player.mass += Math.min(20, s.mass * 0.18); // reward, not free lunch
        combo += 2; comboT = COMBO_WINDOW;
        if (cb.onKill) cb.onKill(s.name);
      }
      // schedule a replacement so population (and rivals) stay healthy
      spawnQueue.push(now + rand(1500, 3500));
    }
  }

  function collide(now) {
    for (var i = 0; i < snakes.length; i++) {
      var s = snakes[i];
      if (s.dead) continue;
      var head = s.segs[0];
      if (now < s.invUntil) continue;
      var invincible = now < s.shieldUntil;
      // boundary
      if (hypot(head.x, head.y) > WORLD_R) { if (!invincible) { killSnake(s, -1, now); continue; } }
      for (var j = 0; j < snakes.length; j++) {
        var o = snakes[j];
        if (o === s || o.dead) continue;
        if (hypot(o.x - s.x, o.y - s.y) > o.segs.length * o.gap + 60) continue;
        var hitR = (s.thickness + o.thickness) * 0.5 * 0.82;
        // head-to-head: smaller one loses
        var headDist = hypot(o.segs[0].x - head.x, o.segs[0].y - head.y);
        if (headDist < hitR + 4) {
          if (!invincible && s.mass <= o.mass) { killSnake(s, o.id, now); break; }
          continue;
        }
        var step = (s.isPlayer || o.isPlayer) ? 2 : 5;
        var hit = false;
        for (var k = 4; k < o.segs.length; k += step) {
          var seg = o.segs[k];
          if (hypot(seg.x - head.x, seg.y - head.y) < hitR) { hit = true; break; }
        }
        if (hit && !invincible) { killSnake(s, o.id, now); break; }
      }
    }
  }

  // ---------- update ----------
  function update(now, dt) {
    if (phase === "play") {
      for (var i = 0; i < snakes.length; i++) {
        var s = snakes[i];
        if (s.dead) continue;
        s.boosting = s.isPlayer ? input.boosting : s.boosting;
        if (s.isPlayer && input.hasTarget) s.targetAngle = input.angle;
        stepSnake(s, now, dt);
        eatFood(s, now);
        if (s.isPlayer) collectPowerups(s, now);
      }
      collide(now);

      // combo timer
      if (comboT > 0) { comboT -= dt * 16.6; if (comboT <= 0) combo = 0; }

      // respawn AI from queue + keep population
      for (var q = spawnQueue.length - 1; q >= 0; q--) {
        if (now >= spawnQueue[q]) { spawnQueue.splice(q, 1); spawnAI(); }
      }
      var alive = 0;
      for (var a = 0; a < snakes.length; a++) if (!snakes[a].dead) alive++;
      if (alive < TARGET_POP && spawnQueue.length === 0 && Math.random() < 0.02) spawnAI();

      // cull dead snakes from list (after corpse dropped)
      for (var d = snakes.length - 1; d >= 0; d--) if (snakes[d].dead && snakes[d] !== player) snakes.splice(d, 1);

      // replenish food & powerups
      if (foods.length < FOOD_TARGET && Math.random() < 0.5) scatterFood(1);
      if (foods.length > FOOD_TARGET * 1.8) foods.splice(0, 40); // cap drift
      if (powerups.length < 6 && Math.random() < 0.004) makePowerup();
      // expire stale claims naturally handled by timestamp

      // score / leaderboard updates
      lbAccum += dt * 16.6;
      if (lbAccum > 250) { lbAccum = 0; reportLeaderboard(); }
    } else if (phase === "dying") {
      dyingT -= dt * 16.6;
      cam.targetZoom = 0.7;
      if (dyingT <= 0) { phase = "dead"; finishDeath(); }
    }

    // particles
    for (var p = particles.length - 1; p >= 0; p--) {
      var pt = particles[p];
      pt.x += pt.vx; pt.y += pt.vy; pt.vx *= 0.93; pt.vy *= 0.93;
      pt.life -= pt.decay;
      if (pt.life <= 0) particles.splice(p, 1);
    }

    // camera
    if (!player.dead || phase !== "dead") {
      cam.x += (player.x - cam.x) * 0.12;
      cam.y += (player.y - cam.y) * 0.12;
    }
    cam.targetZoom = phase === "play" ? clamp(1.05 - (player.mass - START_MASS) / 1400, 0.62, 1.05) : cam.targetZoom;
    cam.zoom += (cam.targetZoom - cam.zoom) * 0.05;

    // shake
    if (shake > 0) {
      shake *= 0.85; if (shake < 0.4) shake = 0;
      shakeX = rand(-shake, shake); shakeY = rand(-shake, shake);
    } else { shakeX = shakeY = 0; }
  }

  function reportLeaderboard() {
    var list = snakes.filter(function (s) { return !s.dead; })
      .map(function (s) { return { name: s.name, score: Math.floor(s.mass), hue: s.hue, me: s.isPlayer }; })
      .sort(function (a, b) { return b.score - a.score; });
    var rank = 1;
    for (var i = 0; i < list.length; i++) if (list[i].me) { rank = i + 1; break; }
    if (cb.onScore) cb.onScore(Math.floor(player.mass), rank, list.slice(0, 8), list.length);
  }

  function finishDeath() {
    cancelAnimationFrame(rafId); running = false;
    if (cb.onGameOver) cb.onGameOver(Math.floor(player.mass));
  }

  // ---------- render ----------
  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    // background
    ctx.fillStyle = "#0a0f1f";
    ctx.fillRect(0, 0, cw, ch);

    var s = cam.zoom * dpr;
    var tx = (cw * dpr) / 2 - cam.x * s + shakeX * dpr;
    var ty = (ch * dpr) / 2 - cam.y * s + shakeY * dpr;
    ctx.setTransform(s, 0, 0, s, tx, ty);

    // visible world bounds
    var vx0 = cam.x - cw / 2 / cam.zoom - 40, vx1 = cam.x + cw / 2 / cam.zoom + 40;
    var vy0 = cam.y - ch / 2 / cam.zoom - 40, vy1 = cam.y + ch / 2 / cam.zoom + 40;

    drawBackground(vx0, vy0, vx1, vy1);
    drawBoundary();
    drawFoods(now, vx0, vy0, vx1, vy1);
    drawPowerups(now);
    // draw snakes sorted so the player & big ones render on top
    var order = snakes.slice().sort(function (a, b) { return a.mass - b.mass; });
    var viewR = hypot(cw, ch) / 2 / cam.zoom + 100;
    for (var i = 0; i < order.length; i++) {
      var sk = order[i];
      if (sk.dead && sk !== player) continue;
      // cull snakes whose whole body is off-screen
      if (!sk.isPlayer && hypot(sk.x - cam.x, sk.y - cam.y) - sk.segs.length * sk.gap > viewR) continue;
      drawSnake(sk, now);
    }
    drawParticles();

    drawMinimap();
  }

  function drawBackground(vx0, vy0, vx1, vy1) {
    var grid = 56;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    var x0 = Math.floor(vx0 / grid) * grid, y0 = Math.floor(vy0 / grid) * grid;
    for (var x = x0; x < vx1; x += grid) {
      for (var y = y0; y < vy1; y += grid) {
        ctx.beginPath(); ctx.arc(x, y, 1.4, 0, 6.28); ctx.fill();
      }
    }
  }

  function drawBoundary() {
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(255,93,122,0.55)";
    ctx.beginPath(); ctx.arc(0, 0, WORLD_R, 0, 6.28); ctx.stroke();
    ctx.lineWidth = 26;
    ctx.strokeStyle = "rgba(255,93,122,0.08)";
    ctx.beginPath(); ctx.arc(0, 0, WORLD_R + 12, 0, 6.28); ctx.stroke();
  }

  function drawFoods(now, vx0, vy0, vx1, vy1) {
    for (var i = 0; i < foods.length; i++) {
      var f = foods[i];
      if (f.x < vx0 || f.x > vx1 || f.y < vy0 || f.y > vy1) continue;
      var pulse = 1 + Math.sin(now / 300 + f.ph) * 0.18;
      ctx.fillStyle = colorFor(f.hue, 62);
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * pulse, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawPowerups(now) {
    var icon = { shield: "🛡", magnet: "🧲", star: "⭐", speed: "⚡" };
    for (var i = 0; i < powerups.length; i++) {
      var p = powerups[i];
      var pulse = 1 + Math.sin(now / 250 + p.ph) * 0.25;
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(p.x, p.y, 22 * pulse, 0, 6.28); ctx.fill();
      ctx.restore();
      ctx.font = "26px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(icon[p.type] || "?", p.x, p.y);
    }
  }

  function drawSnake(s, now) {
    var dead = s.dead;
    var glow = s.boosting || now < s.speedUntil;
    var shield = now < s.shieldUntil;
    var alpha = (now < s.invUntil) ? 0.55 + Math.sin(now / 90) * 0.25 : (dead ? 0.3 : 1);
    ctx.globalAlpha = alpha;

    // body (tail -> head)
    for (var i = s.segs.length - 1; i >= 0; i--) {
      var seg = s.segs[i];
      var t = i / s.segs.length;
      var r = s.thickness * 0.5 * (1 - t * 0.25);
      if (glow) {
        ctx.fillStyle = colorFor(s.hue, 70);
        ctx.globalAlpha = alpha * 0.25;
        ctx.beginPath(); ctx.arc(seg.x, seg.y, r + 6, 0, 6.28); ctx.fill();
        ctx.globalAlpha = alpha;
      }
      ctx.fillStyle = colorFor(s.hue, 42 + (1 - t) * 22);
      ctx.beginPath(); ctx.arc(seg.x, seg.y, r, 0, 6.28); ctx.fill();
    }
    // head highlight + eyes
    var h = s.segs[0];
    var hr = s.thickness * 0.55;
    ctx.fillStyle = colorFor(s.hue, 72);
    ctx.beginPath(); ctx.arc(h.x, h.y, hr, 0, 6.28); ctx.fill();
    if (shield) {
      ctx.globalAlpha = alpha * 0.7; ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(120,200,255,0.9)";
      ctx.beginPath(); ctx.arc(h.x, h.y, hr + 6 + Math.sin(now / 150) * 2, 0, 6.28); ctx.stroke();
      ctx.globalAlpha = alpha;
    }
    var ea = s.angle, ox = Math.cos(ea + 0.5) * hr * 0.5, oy = Math.sin(ea + 0.5) * hr * 0.5;
    var ox2 = Math.cos(ea - 0.5) * hr * 0.5, oy2 = Math.sin(ea - 0.5) * hr * 0.5;
    var fx = Math.cos(ea) * hr * 0.4, fy = Math.sin(ea) * hr * 0.4;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(h.x + ox + fx, h.y + oy + fy, hr * 0.32, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(h.x + ox2 + fx, h.y + oy2 + fy, hr * 0.32, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#04122a";
    ctx.beginPath(); ctx.arc(h.x + ox + fx * 1.5, h.y + oy + fy * 1.5, hr * 0.16, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(h.x + ox2 + fx * 1.5, h.y + oy2 + fy * 1.5, hr * 0.16, 0, 6.28); ctx.fill();

    ctx.globalAlpha = 1;
    // name + score label
    if (!dead) {
      ctx.font = (s.isPlayer ? "bold " : "") + "13px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillStyle = s.isPlayer ? "#9bffe9" : "rgba(255,255,255,0.7)";
      ctx.fillText(s.name + "  " + Math.floor(s.mass), h.x, h.y - hr - 6);
    }
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = p.life;
      ctx.fillStyle = colorFor(p.hue, 65);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMinimap() {
    if (!minimap) return;
    var m = mmx, size = 120, R = size / 2 - 6, c = size / 2;
    m.clearRect(0, 0, size, size);
    m.fillStyle = "rgba(10,15,31,0.6)";
    m.beginPath(); m.arc(c, c, R + 4, 0, 6.28); m.fill();
    m.strokeStyle = "rgba(255,93,122,0.5)"; m.lineWidth = 2;
    m.beginPath(); m.arc(c, c, R, 0, 6.28); m.stroke();
    function mp(x, y) { return [c + x / WORLD_R * R, c + y / WORLD_R * R]; }
    for (var i = 0; i < snakes.length; i++) {
      var s = snakes[i]; if (s.dead) continue;
      var pt = mp(s.x, s.y);
      m.fillStyle = s.isPlayer ? "#38e1c9" : colorFor(s.hue, 60);
      m.beginPath(); m.arc(pt[0], pt[1], s.isPlayer ? 3.4 : 2, 0, 6.28); m.fill();
    }
  }

  // ---------- loop ----------
  function frame(t) {
    if (!running) return;
    var dt = lastT ? clamp((t - lastT) / 16.666, 0.2, 3) : 1;
    lastT = t;
    if (!paused) { update(t, dt); draw(t); }
    rafId = requestAnimationFrame(frame);
  }

  // ---------- input ----------
  function setAngleFromPoint(clientX, clientY) {
    if (input.control === "follow") {
      // steer toward finger relative to screen center (where the snake is)
      var dx = clientX - cw / 2, dy = clientY - ch / 2;
      if (hypot(dx, dy) > 12) { input.angle = Math.atan2(dy, dx); input.hasTarget = true; }
    } else { // swipe / virtual stick relative to touch origin
      var ddx = clientX - input.originX, ddy = clientY - input.originY;
      if (hypot(ddx, ddy) > 16) { input.angle = Math.atan2(ddy, ddx); input.hasTarget = true; }
    }
  }

  function onDown(e) {
    var p = e.touches ? e.touches[0] : e;
    input.active = true; input.originX = p.clientX; input.originY = p.clientY;
    setAngleFromPoint(p.clientX, p.clientY);
  }
  function onMove(e) {
    var p = e.touches ? e.touches[0] : e;
    if (input.control === "swipe" && !input.active && !e.touches) return; // mouse: only when relevant
    if (input.control === "follow" || input.active) setAngleFromPoint(p.clientX, p.clientY);
    if (e.cancelable) e.preventDefault();
  }
  function onUp() { input.active = false; }

  function bindInput() {
    canvas.addEventListener("touchstart", function (e) { onDown(e); if (e.cancelable) e.preventDefault(); }, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onUp);
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", function (e) { if (running && input.control === "follow") setAngleFromPoint(e.clientX, e.clientY); else onMove(e); });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", function (e) {
      if (e.code === "Space") { input.boosting = true; }
    });
    window.addEventListener("keyup", function (e) { if (e.code === "Space") input.boosting = false; });
  }

  function resize() {
    dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    canvas.width = Math.floor(cw * dpr); canvas.height = Math.floor(ch * dpr);
  }

  // ---------- public API ----------
  var SnakeGame = {
    start: function (cnv, opts) {
      cb = opts || {};
      canvas = cnv; ctx = canvas.getContext("2d");
      minimap = document.getElementById("minimap");
      mmx = minimap ? minimap.getContext("2d") : null;
      input.control = (cb.control) || "follow";
      input.boosting = false; input.hasTarget = false;
      resize();
      window.addEventListener("resize", resize);
      if (!SnakeGame._bound) { bindInput(); SnakeGame._bound = true; }
      initWorld();
      phase = "play"; paused = false; running = true; lastT = 0;
      reportLeaderboard();
      rafId = requestAnimationFrame(frame);
    },
    respawnPlayer: function () {
      var p = spawnPos(null, 0);
      player.dead = false; player.mass = START_MASS; player.x = p.x; player.y = p.y;
      player.angle = player.targetAngle = p.a; player.invUntil = performance.now() + 2400;
      player.shieldUntil = player.magnetUntil = player.speedUntil = 0;
      // coiled start: body begins stacked at the head and uncoils as you move
      player.segs = [];
      var n = segCountOf(START_MASS);
      for (var i = 0; i < n; i++) player.segs.push({ x: p.x, y: p.y });
      cam.x = p.x; cam.y = p.y;
      combo = 0; comboT = 0;
      phase = "play"; paused = false; running = true; lastT = 0;
      rafId = requestAnimationFrame(frame);
    },
    setBoost: function (on) { input.boosting = !!on; if (on) SFX.boostStart(); },
    setControl: function (mode) { input.control = mode; },
    pause: function () { paused = true; },
    resume: function () { paused = false; lastT = 0; },
    isPlaying: function () { return running; },
    stop: function () {
      running = false; paused = false; cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    }
  };

  global.SnakeGame = SnakeGame;
})(window);
