/* ルミナ・サバイバー (Lumina Survivor) — an original-world Vampire-Survivors-like.
   You are the last Lumina, a luminous guardian in a world swallowed by the
   eternal night "Tokoyami". Move to survive; your light-weapons fire on their
   own. Slain shades drop lux shards (XP) — level up to pick new powers.

   Public API on window.LuminaGame: start, pause, resume, stop, isPlaying,
   setMove. The host (app.js) supplies callbacks for HUD + level-up + results.

   Rendering uses pre-baked glow sprites drawn with additive blending for a
   neon look that stays cheap even with a screenful of enemies. */
(function (global) {
  "use strict";

  // ---------- math helpers ----------
  var TAU = Math.PI * 2;
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function hypot(x, y) { return Math.sqrt(x * x + y * y); }
  function pickOne(a) { return a[(Math.random() * a.length) | 0]; }

  // ---------- tunables ----------
  var BASE_SPEED = 138;      // player px/sec
  var BASE_HP = 100;
  var BASE_MAGNET = 78;      // pickup radius
  var IFRAME = 0.55;         // invuln seconds after a hit
  var MAX_WEAPONS = 6;
  var WEAPON_MAX_LV = 8;
  var PASSIVE_MAX_LV = 6;

  // ---------- weapon / passive metadata ----------
  var WEAPON_KEYS = ["bolt", "halo", "aura", "nova", "spark", "star"];
  var WEAPON_META = {
    bolt:  { icon: "💫", name: "ルクス弾",   desc: "最も近い敵へ光弾を自動発射" },
    halo:  { icon: "🪐", name: "光輪",       desc: "周囲を回る光のオーブ" },
    aura:  { icon: "🔆", name: "聖環",       desc: "身を包む光が触れた敵を焼く" },
    nova:  { icon: "💥", name: "新星",       desc: "周期的に光の衝撃波を放つ" },
    spark: { icon: "⚡", name: "連鎖雷",     desc: "敵から敵へ飛び移る稲妻" },
    star:  { icon: "☄", name: "流星",       desc: "空から光の流星が降り注ぐ" }
  };
  var PASSIVE_KEYS = ["power", "haste", "swift", "vigor", "regen", "magnet", "guard", "greed"];
  var PASSIVE_META = {
    power:  { icon: "🔥", name: "炎心",   desc: "与ダメージ +12%" },
    haste:  { icon: "⏱", name: "疾撃",   desc: "攻撃の間隔 -8%" },
    swift:  { icon: "👟", name: "韋駄天", desc: "移動速度 +10%" },
    vigor:  { icon: "❤", name: "生命",   desc: "最大HP +22 / 全回復少し" },
    regen:  { icon: "✚", name: "再生",   desc: "毎秒HP回復 +0.6" },
    magnet: { icon: "🧲", name: "引力",   desc: "取得範囲 +28%" },
    guard:  { icon: "🛡", name: "加護",   desc: "被ダメージ -6%" },
    greed:  { icon: "🔮", name: "宝眼",   desc: "経験値 +12%" }
  };

  // ---------- enemy definitions (base stats; scaled by elapsed time) ----------
  var ENEMY = {
    shade: { hp: 8,   speed: 48, dmg: 7,  r: 14, xp: 1,  color: "#b070ff", spr: "shade" },
    wisp:  { hp: 5,   speed: 96, dmg: 5,  r: 11, xp: 1,  color: "#ff6cd8", spr: "wisp" },
    brute: { hp: 52,  speed: 31, dmg: 15, r: 24, xp: 5,  color: "#5fa0ff", spr: "brute" },
    boss:  { hp: 1100, speed: 40, dmg: 24, r: 44, xp: 70, color: "#ffd24a", spr: "boss", boss: true }
  };

  // ---------- module state ----------
  var canvas, ctx, dpr = 1, cw = 0, ch = 0;
  var cb = {};
  var running = false, phase = "idle"; // idle | play | paused | levelup | dead
  var rafId = 0, lastT = 0, elapsed = 0;

  var P = null;                 // player
  var cam = { x: 0, y: 0 };
  var shake = { mag: 0, t: 0 };
  var move = { x: 0, y: 0 };    // current input vector (-1..1)

  var enemies, gems, drops, shots, novas, meteors, bolts, parts, texts;
  var weapons;                  // map key -> { key, level, cd, ... }
  var level, xp, xpNext, kills, pendingLevels, bossTimer, swarmTimer, spawnTimer;
  var flash = 0;                // full-screen hurt flash 0..1

  var MAX_ENEMIES = 180;
  var sprites = {}, spritesOK = false;
  var bgGrad = null, vignette = null, motes = [];

  // ---------- sprite baking ----------
  function makeCanvas(w, h) {
    if (typeof document === "undefined" || !document.createElement) return null;
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }
  function bake(w, h, draw) {
    var c = makeCanvas(w, h);
    if (!c) return null;
    var g = c.getContext("2d");
    if (!g) return null;
    draw(g, w, h);
    return c;
  }
  function radial(g, x, y, r, stops) {
    var grd = g.createRadialGradient(x, y, 0, x, y, r);
    for (var i = 0; i < stops.length; i++) grd.addColorStop(stops[i][0], stops[i][1]);
    return grd;
  }

  function buildSprites() {
    if (spritesOK) return;            // sprites are run-independent; bake once
    sprites = {};
    // --- player: bright core + cyan halo ---
    sprites.player = bake(120, 120, function (g) {
      g.fillStyle = radial(g, 60, 60, 60, [[0, "rgba(180,255,245,0.9)"], [0.18, "rgba(80,230,220,0.6)"], [0.5, "rgba(56,140,255,0.25)"], [1, "rgba(56,140,255,0)"]]);
      g.fillRect(0, 0, 120, 120);
      g.fillStyle = radial(g, 60, 60, 22, [[0, "#ffffff"], [0.5, "#9bffe9"], [1, "rgba(56,225,201,0)"]]);
      g.beginPath(); g.arc(60, 60, 22, 0, TAU); g.fill();
    });
    // --- shade: dark wispy body with glowing rim + two eyes ---
    sprites.shade = enemySprite("#b070ff", "#2a0f4d");
    sprites.wisp = bake(56, 56, function (g) {
      g.fillStyle = radial(g, 28, 28, 28, [[0, "rgba(255,150,235,0.95)"], [0.4, "rgba(255,108,216,0.5)"], [1, "rgba(255,108,216,0)"]]);
      g.fillRect(0, 0, 56, 56);
      g.fillStyle = "#fff"; g.beginPath();
      g.moveTo(28, 12); g.lineTo(40, 28); g.lineTo(28, 44); g.lineTo(16, 28); g.closePath(); g.fill();
    });
    sprites.brute = enemySprite("#5fa0ff", "#0b1a40", 1.4, "#7fd0ff");
    sprites.boss = bake(120, 120, function (g) {
      g.fillStyle = radial(g, 60, 60, 60, [[0, "rgba(255,230,150,0.95)"], [0.3, "rgba(255,170,60,0.55)"], [1, "rgba(255,120,30,0)"]]);
      g.fillRect(0, 0, 120, 120);
      g.fillStyle = "#1a0e02";
      g.beginPath(); g.arc(60, 64, 34, 0, TAU); g.fill();
      // crown spikes
      g.fillStyle = "#ffd24a";
      for (var i = 0; i < 7; i++) {
        var a = -Math.PI / 2 + (i - 3) * 0.5;
        g.beginPath();
        g.moveTo(60 + Math.cos(a) * 30, 64 + Math.sin(a) * 30);
        g.lineTo(60 + Math.cos(a) * 50, 64 + Math.sin(a) * 50);
        g.lineTo(60 + Math.cos(a + 0.18) * 30, 64 + Math.sin(a + 0.18) * 30);
        g.closePath(); g.fill();
      }
      g.fillStyle = "#ff5d4a";
      g.beginPath(); g.arc(50, 58, 5, 0, TAU); g.arc(70, 58, 5, 0, TAU); g.fill();
    });
    // --- gems by tier ---
    sprites.gem0 = gemSprite("#7fdfff", "#2f7fff");
    sprites.gem1 = gemSprite("#9bffb0", "#2fd07f");
    sprites.gem2 = gemSprite("#ffe27a", "#ffae2f");
    // --- pickups ---
    sprites.heart = bake(40, 40, function (g) {
      g.fillStyle = radial(g, 20, 20, 20, [[0, "rgba(255,150,190,0.8)"], [1, "rgba(255,93,122,0)"]]); g.fillRect(0, 0, 40, 40);
      g.fillStyle = "#ff7da6"; heartPath(g, 20, 22, 9); g.fill();
    });
    sprites.magnet = bake(40, 40, function (g) {
      g.fillStyle = radial(g, 20, 20, 20, [[0, "rgba(150,255,245,0.8)"], [1, "rgba(56,225,201,0)"]]); g.fillRect(0, 0, 40, 40);
      g.strokeStyle = "#38e1c9"; g.lineWidth = 5; g.lineCap = "round";
      g.beginPath(); g.arc(20, 18, 9, Math.PI, TAU); g.stroke();
      g.beginPath(); g.moveTo(11, 18); g.lineTo(11, 28); g.moveTo(29, 18); g.lineTo(29, 28); g.stroke();
    });
    // --- projectile ---
    sprites.bolt = bake(36, 36, function (g) {
      g.fillStyle = radial(g, 18, 18, 18, [[0, "#ffffff"], [0.4, "#9bffe9"], [1, "rgba(56,225,201,0)"]]);
      g.fillRect(0, 0, 36, 36);
    });
    sprites.orb = bake(40, 40, function (g) {
      g.fillStyle = radial(g, 20, 20, 20, [[0, "#ffffff"], [0.35, "#b9c4ff"], [0.7, "rgba(108,140,255,0.5)"], [1, "rgba(108,140,255,0)"]]);
      g.fillRect(0, 0, 40, 40);
    });
    spritesOK = !!sprites.player;
  }

  function enemySprite(rim, body, scale, crack) {
    scale = scale || 1;
    return bake(64, 64, function (g) {
      g.fillStyle = radial(g, 32, 32, 32, [[0, hexA(rim, 0.55)], [0.55, hexA(rim, 0.4)], [1, hexA(rim, 0)]]);
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = radial(g, 32, 30, 22 * scale, [[0, body], [0.7, body], [0.92, rim], [1, hexA(rim, 0.2)]]);
      g.beginPath(); g.arc(32, 32, 22 * scale, 0, TAU); g.fill();
      if (crack) {
        g.strokeStyle = crack; g.lineWidth = 2;
        g.beginPath(); g.moveTo(24, 22); g.lineTo(30, 34); g.lineTo(26, 44); g.stroke();
        g.beginPath(); g.moveTo(40, 24); g.lineTo(36, 32); g.lineTo(42, 42); g.stroke();
      } else {
        g.fillStyle = "#fff";
        g.beginPath(); g.arc(26, 30, 3.2, 0, TAU); g.arc(38, 30, 3.2, 0, TAU); g.fill();
        g.fillStyle = rim;
        g.beginPath(); g.arc(26, 30, 1.6, 0, TAU); g.arc(38, 30, 1.6, 0, TAU); g.fill();
      }
    });
  }
  function gemSprite(light, dark) {
    return bake(28, 28, function (g) {
      g.fillStyle = radial(g, 14, 14, 14, [[0, hexA(light, 0.9)], [1, hexA(light, 0)]]); g.fillRect(0, 0, 28, 28);
      g.fillStyle = light;
      g.beginPath(); g.moveTo(14, 4); g.lineTo(23, 14); g.lineTo(14, 24); g.lineTo(5, 14); g.closePath(); g.fill();
      g.fillStyle = dark;
      g.beginPath(); g.moveTo(14, 14); g.lineTo(23, 14); g.lineTo(14, 24); g.closePath(); g.fill();
    });
  }
  function heartPath(g, x, y, s) {
    g.beginPath();
    g.moveTo(x, y + s * 0.7);
    g.bezierCurveTo(x - s * 1.4, y - s * 0.5, x - s * 0.5, y - s * 1.2, x, y - s * 0.3);
    g.bezierCurveTo(x + s * 0.5, y - s * 1.2, x + s * 1.4, y - s * 0.5, x, y + s * 0.7);
    g.closePath();
  }
  // turn "#rrggbb" into rgba() with alpha (sprite gradients need transparency)
  function hexA(hex, a) {
    if (hex[0] !== "#") return hex;
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  // ---------- world setup ----------
  function initWorld() {
    P = {
      x: 0, y: 0, vx: 0, vy: 0,
      hp: BASE_HP, hpMax: BASE_HP,
      speed: BASE_SPEED, magnet: BASE_MAGNET,
      dmgMul: 1, cdMul: 1, speedMul: 1, magnetMul: 1, xpMul: 1, armor: 0, regen: 0,
      inv: 0, hue: 0, facing: 0, passives: {}
    };
    cam.x = 0; cam.y = 0;
    enemies = []; gems = []; drops = []; shots = []; novas = []; meteors = []; bolts = []; parts = []; texts = [];
    weapons = {};
    addWeapon("bolt");
    level = 1; xp = 0; xpNext = xpFor(1); kills = 0; pendingLevels = 0;
    bossTimer = 60; swarmTimer = 28; spawnTimer = 0; elapsed = 0; flash = 0;
    shake.mag = 0; shake.t = 0;
    recompute();
    emitStats(); emitWeapons();
  }

  function xpFor(lv) { return Math.floor(5 + lv * 3.4 + lv * lv * 0.55); }

  function addWeapon(key) {
    var w = { key: key, level: 1, cd: 0.4, orbA: 0 };
    weapons[key] = w;
    return w;
  }

  function recompute() {
    var p = P.passives;
    P.dmgMul = 1 + 0.12 * (p.power || 0);
    P.cdMul = Math.max(0.4, 1 - 0.08 * (p.haste || 0));
    P.speedMul = 1 + 0.10 * (p.swift || 0);
    P.magnetMul = 1 + 0.28 * (p.magnet || 0);
    P.xpMul = 1 + 0.12 * (p.greed || 0);
    P.armor = Math.min(0.6, 0.06 * (p.guard || 0));
    P.regen = 0.6 * (p.regen || 0);
    P.speed = BASE_SPEED * P.speedMul;
    P.magnet = BASE_MAGNET * P.magnetMul;
    var newMax = BASE_HP + 22 * (p.vigor || 0);
    if (newMax > P.hpMax) P.hp = Math.min(newMax, P.hp + (newMax - P.hpMax));
    P.hpMax = newMax;
  }

  // ---------- spawning ----------
  function minutes() { return elapsed / 60; }
  function spawnRing() { return Math.max(cw, ch) * 0.62 + 80; }

  function spawnEnemy(type, ax, ay) {
    if (enemies.length >= MAX_ENEMIES && type !== "boss") return null;
    var d = ENEMY[type];
    var m = minutes();
    var ang, dist;
    if (ax == null) { ang = rand(0, TAU); dist = spawnRing() * rand(1.0, 1.12); ax = P.x + Math.cos(ang) * dist; ay = P.y + Math.sin(ang) * dist; }
    var hpMul = 1 + m * 0.6 + (d.boss ? m * 1.4 : 0);
    var e = {
      type: type, x: ax, y: ay,
      r: d.r, color: d.color, spr: d.spr, boss: !!d.boss,
      hp: d.hp * hpMul, hpMax: d.hp * hpMul,
      speed: d.speed * (1 + m * 0.02),
      dmg: d.dmg * (1 + m * 0.08),
      xp: d.xp, flash: 0, kx: 0, ky: 0, wob: rand(0, TAU)
    };
    enemies.push(e);
    return e;
  }

  function director(dt) {
    var m = minutes();
    // steady trickle, faster over time
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = Math.max(0.32, 1.15 - m * 0.13);
      var batch = 2 + Math.floor(m * 1.5);
      for (var i = 0; i < batch; i++) {
        var roll = Math.random();
        var type = "shade";
        if (m > 1 && roll < 0.32) type = "wisp";
        if (m > 2.5 && roll > 0.86) type = "brute";
        spawnEnemy(type);
      }
    }
    // periodic encircling swarm
    swarmTimer -= dt;
    if (swarmTimer <= 0) {
      swarmTimer = Math.max(16, 34 - m * 1.6);
      var n = 16 + Math.floor(m * 3), a0 = rand(0, TAU), R = spawnRing() * 1.05;
      for (var k = 0; k < n; k++) {
        var a = a0 + (k / n) * TAU;
        spawnEnemy(m > 3 ? "wisp" : "shade", P.x + Math.cos(a) * R, P.y + Math.sin(a) * R);
      }
    }
    // boss every 60s
    bossTimer -= dt;
    if (bossTimer <= 0) {
      bossTimer = 60;
      spawnEnemy("boss");
      addShake(8); flash = Math.max(flash, 0.4);
      if (global.SFX) SFX.lumBoss();
      if (cb.onBoss) cb.onBoss();
    }
  }

  // ---------- combat helpers ----------
  function nearest(n, fromX, fromY, maxD2) {
    // returns up to n nearest enemies (small n; simple selection scan)
    var out = [];
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var dx = e.x - fromX, dy = e.y - fromY, d2 = dx * dx + dy * dy;
      if (maxD2 && d2 > maxD2) continue;
      if (out.length < n) { out.push({ e: e, d2: d2 }); out.sort(byD2); }
      else if (d2 < out[n - 1].d2) { out[n - 1] = { e: e, d2: d2 }; out.sort(byD2); }
    }
    return out;
  }
  function byD2(a, b) { return a.d2 - b.d2; }

  function hurtEnemy(e, dmg, kx, ky) {
    e.hp -= dmg;
    e.flash = 0.12;
    if (kx || ky) { e.kx += kx; e.ky += ky; }
    spawnText(e.x, e.y - e.r, Math.round(dmg), e.boss ? "#ffd24a" : "#ffffff", e.boss ? 18 : 13);
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    var i = enemies.indexOf(e);
    if (i >= 0) { enemies[i] = enemies[enemies.length - 1]; enemies.pop(); }
    kills++;
    burst(e.x, e.y, e.color, e.boss ? 36 : 9, e.boss ? 4 : 2);
    // drop lux shards
    var gemN = e.boss ? 10 : 1;
    var tier = e.boss ? 2 : (e.xp >= 5 ? 1 : 0);
    for (var k = 0; k < gemN; k++) {
      gems.push({ x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r), value: e.xp, tier: tier, vx: rand(-40, 40), vy: rand(-40, 40), att: false, t: 0 });
    }
    if (e.boss) { drops.push(mkDrop(e.x, e.y, "heart")); drops.push(mkDrop(e.x + 20, e.y, "magnet")); addShake(6); }
    else {
      var r = Math.random();
      if (r < 0.012) drops.push(mkDrop(e.x, e.y, "heart"));
      else if (r < 0.020) drops.push(mkDrop(e.x, e.y, "magnet"));
    }
  }
  function mkDrop(x, y, kind) { return { x: x, y: y, kind: kind, att: false, t: 0, bob: rand(0, TAU) }; }

  function damageArea(x, y, radius, dmg, kb) {
    var r2 = radius * radius, hit = 0;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
      if (d2 <= r2) {
        var d = Math.sqrt(d2) || 1;
        hurtEnemy(e, dmg, kb ? dx / d * kb : 0, kb ? dy / d * kb : 0);
        hit++;
        if (enemies[i] !== e) i--; // an enemy was swap-removed into i
      }
    }
    return hit;
  }

  // ---------- weapons ----------
  function updateWeapons(dt) {
    for (var key in weapons) {
      var w = weapons[key];
      if (key === "bolt") wBolt(w, dt);
      else if (key === "halo") wHalo(w, dt);
      else if (key === "aura") wAura(w, dt);
      else if (key === "nova") wNova(w, dt);
      else if (key === "spark") wSpark(w, dt);
      else if (key === "star") wStar(w, dt);
    }
  }

  function wBolt(w, dt) {
    w.cd -= dt;
    if (w.cd > 0) return;
    var lv = w.level;
    w.cd = Math.max(0.22, (0.92 - lv * 0.05) * P.cdMul);
    var count = 1 + Math.floor((lv - 1) / 2);
    var dmg = (6 + lv * 3.2) * P.dmgMul;
    var pierce = Math.floor((lv - 1) / 3);
    var tg = nearest(count, P.x, P.y);
    for (var i = 0; i < count; i++) {
      var ang;
      if (tg[i]) ang = Math.atan2(tg[i].e.y - P.y, tg[i].e.x - P.x);
      else ang = P.facing + rand(-0.5, 0.5);
      shots.push({ x: P.x, y: P.y, vx: Math.cos(ang) * 420, vy: Math.sin(ang) * 420, dmg: dmg, r: 8, life: 1.3, pierce: pierce, hitIds: [] });
    }
  }

  function wHalo(w, dt) {
    var lv = w.level;
    var count = Math.min(8, 2 + Math.floor(lv / 1.5));
    var radius = 64 + lv * 7;
    w.orbA = (w.orbA + dt * (1.7 + lv * 0.08)) % TAU;
    w.cd -= dt;
    var doHit = w.cd <= 0;
    if (doHit) w.cd = 0.12;
    var dmg = (4 + lv * 2.4) * P.dmgMul;
    w._orbs = [];
    for (var i = 0; i < count; i++) {
      var a = w.orbA + (i / count) * TAU;
      var ox = P.x + Math.cos(a) * radius, oy = P.y + Math.sin(a) * radius;
      w._orbs.push([ox, oy]);
      if (doHit) damageArea(ox, oy, 16 + lv, dmg, 60);
    }
  }

  function wAura(w, dt) {
    w._radius = 58 + w.level * 10;
    w.cd -= dt;
    if (w.cd > 0) return;
    w.cd = 0.4;
    damageArea(P.x, P.y, w._radius, (3 + w.level * 2) * P.dmgMul, 30);
  }

  function wNova(w, dt) {
    w.cd -= dt;
    if (w.cd > 0) return;
    var lv = w.level;
    w.cd = (2.6 - lv * 0.12) * P.cdMul;
    novas.push({ x: P.x, y: P.y, r: 8, maxR: 150 + lv * 22, dmg: (9 + lv * 4.5) * P.dmgMul, hit: [] });
    addShake(3);
    if (global.SFX) SFX.lumNova();
  }

  function wSpark(w, dt) {
    w.cd -= dt;
    if (w.cd > 0) return;
    var lv = w.level;
    w.cd = (1.7 - lv * 0.07) * P.cdMul;
    var jumps = 2 + lv;
    var dmg = (7 + lv * 3) * P.dmgMul;
    var jumpR2 = 200 * 200;
    var first = nearest(1, P.x, P.y, 360 * 360)[0];
    if (!first) return;
    var cur = first.e, fx = P.x, fy = P.y;
    var used = [];
    for (var j = 0; j < jumps && cur; j++) {
      bolts.push({ x1: fx, y1: fy, x2: cur.x, y2: cur.y, life: 0.18 });
      hurtEnemy(cur, dmg, 0, 0);
      used.push(cur);
      fx = cur.x; fy = cur.y;
      var nxt = null, best = jumpR2;
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (used.indexOf(e) >= 0) continue;
        var dx = e.x - fx, dy = e.y - fy, d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; nxt = e; }
      }
      cur = nxt;
    }
  }

  function wStar(w, dt) {
    w.cd -= dt;
    if (w.cd > 0) return;
    var lv = w.level;
    w.cd = (2.4 - lv * 0.09) * P.cdMul;
    var n = 1 + Math.floor(lv / 2);
    for (var i = 0; i < n; i++) {
      var tg = enemies.length ? pickOne(enemies) : null;
      var tx = tg ? tg.x + rand(-40, 40) : P.x + rand(-260, 260);
      var ty = tg ? tg.y + rand(-40, 40) : P.y + rand(-260, 260);
      meteors.push({ x: tx, y: ty, fall: 0.85, aoe: 70 + lv * 8, dmg: (12 + lv * 6) * P.dmgMul });
    }
  }

  // ---------- update ----------
  function update(dt) {
    elapsed += dt;
    // input -> velocity
    var mx = move.x, my = move.y, ml = hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; ml = 1; }
    P.vx = mx * P.speed; P.vy = my * P.speed;
    P.x += P.vx * dt; P.y += P.vy * dt;
    if (ml > 0.05) P.facing = Math.atan2(my, mx);
    P.hue = (P.hue + dt * 40) % 360;
    if (P.inv > 0) P.inv -= dt;
    if (P.regen) P.hp = Math.min(P.hpMax, P.hp + P.regen * dt);

    // smooth camera
    cam.x += (P.x - cam.x) * Math.min(1, dt * 8);
    cam.y += (P.y - cam.y) * Math.min(1, dt * 8);

    director(dt);
    updateWeapons(dt);

    // enemies chase + separate a little + contact damage
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var dx = P.x - e.x, dy = P.y - e.y, d = hypot(dx, dy) || 1;
      e.wob += dt * 6;
      var nx = dx / d, ny = dy / d;
      e.x += nx * e.speed * dt + e.kx * dt;
      e.y += ny * e.speed * dt + e.ky * dt;
      e.kx *= 0.86; e.ky *= 0.86;
      if (e.flash > 0) e.flash -= dt;
      // relocate stragglers far behind the player so pressure stays up
      if (d > spawnRing() * 2.2) {
        var a = Math.atan2(P.y - e.y, P.x - e.x) + rand(-1, 1);
        e.x = P.x + Math.cos(a) * spawnRing(); e.y = P.y + Math.sin(a) * spawnRing();
      }
      if (d < e.r + 16 && P.inv <= 0) {
        var dmg = e.dmg * (1 - P.armor);
        P.hp -= dmg; P.inv = IFRAME;
        flash = Math.max(flash, 0.5); addShake(5);
        spawnText(P.x, P.y - 30, "-" + Math.round(dmg), "#ff5d7a", 15);
        if (global.SFX) SFX.lumHurt();
        if (cb.onHurt) cb.onHurt();
        if (P.hp <= 0) { gameOver(); return; }
      }
    }

    // projectiles
    for (var s = shots.length - 1; s >= 0; s--) {
      var p = shots[s];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      var dead = p.life <= 0;
      if (!dead) {
        for (var j = 0; j < enemies.length; j++) {
          var en = enemies[j];
          if (p.hitIds.indexOf(en) >= 0) continue;
          var ex = en.x - p.x, ey = en.y - p.y;
          if (ex * ex + ey * ey < (en.r + p.r) * (en.r + p.r)) {
            hurtEnemy(en, p.dmg, p.vx * 0.06, p.vy * 0.06);
            p.hitIds.push(en);
            if (p.pierce-- <= 0) { dead = true; break; }
          }
        }
      }
      if (dead) { shots[s] = shots[shots.length - 1]; shots.pop(); }
    }

    // novas (expanding rings)
    for (var nv = novas.length - 1; nv >= 0; nv--) {
      var no = novas[nv];
      no.r += dt * 520;
      for (var q = 0; q < enemies.length; q++) {
        var ne = enemies[q];
        if (no.hit.indexOf(ne) >= 0) continue;
        var ddx = ne.x - no.x, ddy = ne.y - no.y, dd = hypot(ddx, ddy);
        if (dd <= no.r && dd >= no.r - 26) {
          hurtEnemy(ne, no.dmg, ddx / (dd || 1) * 120, ddy / (dd || 1) * 120);
          no.hit.push(ne);
          if (enemies[q] !== ne) q--;
        }
      }
      if (no.r >= no.maxR) { novas[nv] = novas[novas.length - 1]; novas.pop(); }
    }

    // meteors
    for (var mt = meteors.length - 1; mt >= 0; mt--) {
      var mo = meteors[mt];
      mo.fall -= dt;
      if (mo.fall <= 0) {
        damageArea(mo.x, mo.y, mo.aoe, mo.dmg, 140);
        burst(mo.x, mo.y, "#ffd24a", 18, 3); addShake(4);
        meteors[mt] = meteors[meteors.length - 1]; meteors.pop();
      }
    }

    // lightning fade
    for (var b = bolts.length - 1; b >= 0; b--) { bolts[b].life -= dt; if (bolts[b].life <= 0) { bolts[b] = bolts[bolts.length - 1]; bolts.pop(); } }

    // gems: drift, magnet, collect
    for (var g = gems.length - 1; g >= 0; g--) {
      var gm = gems[g];
      gm.t += dt;
      var gdx = P.x - gm.x, gdy = P.y - gm.y, gd = hypot(gdx, gdy);
      if (gm.att || gd < P.magnet) {
        gm.att = true;
        var sp = 260 + (P.magnet - gd) * 3;
        gm.x += gdx / (gd || 1) * sp * dt; gm.y += gdy / (gd || 1) * sp * dt;
      } else {
        gm.x += gm.vx * dt; gm.y += gm.vy * dt; gm.vx *= 0.9; gm.vy *= 0.9;
      }
      if (gd < 16) {
        xp += gm.value * P.xpMul;
        gems[g] = gems[gems.length - 1]; gems.pop();
        if (global.SFX && gm.t > 0.05) SFX.lumPick();
      }
    }

    // drops (heart / magnet)
    for (var d2 = drops.length - 1; d2 >= 0; d2--) {
      var dr = drops[d2];
      dr.t += dt; dr.bob += dt * 3;
      var ddx2 = P.x - dr.x, ddy2 = P.y - dr.y, dd2 = hypot(ddx2, ddy2);
      if (dd2 < P.magnet) { dr.x += ddx2 / (dd2 || 1) * 300 * dt; dr.y += ddy2 / (dd2 || 1) * 300 * dt; }
      if (dd2 < 18) {
        if (dr.kind === "heart") { P.hp = Math.min(P.hpMax, P.hp + P.hpMax * 0.25); spawnText(P.x, P.y - 30, "+HP", "#ff7da6", 15); if (global.SFX) SFX.life(); }
        else { for (var z = 0; z < gems.length; z++) gems[z].att = true; spawnText(P.x, P.y - 30, "MAGNET", "#38e1c9", 14); if (global.SFX) SFX.powerup(); }
        drops[d2] = drops[drops.length - 1]; drops.pop();
      }
    }

    // particles + texts
    for (var pa = parts.length - 1; pa >= 0; pa--) {
      var pt = parts[pa];
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.92; pt.vy *= 0.92; pt.life -= dt;
      if (pt.life <= 0) { parts[pa] = parts[parts.length - 1]; parts.pop(); }
    }
    for (var tx = texts.length - 1; tx >= 0; tx--) {
      var tt = texts[tx]; tt.y += tt.vy * dt; tt.vy *= 0.92; tt.life -= dt;
      if (tt.life <= 0) { texts[tx] = texts[texts.length - 1]; texts.pop(); }
    }

    if (flash > 0) flash = Math.max(0, flash - dt * 2.2);
    if (shake.t > 0) shake.t -= dt; else shake.mag = 0;

    // level ups
    while (xp >= xpNext) { xp -= xpNext; level++; xpNext = xpFor(level); pendingLevels++; }
    emitStats();
    if (pendingLevels > 0) triggerLevelUp();
  }

  // ---------- level up ----------
  function rollChoices() {
    var pool = [];
    var owned = Object.keys(weapons).length;
    for (var k in weapons) if (weapons[k].level < WEAPON_MAX_LV) pool.push({ id: "w:" + k, kind: "weapon", key: k, level: weapons[k].level });
    if (owned < MAX_WEAPONS) {
      for (var i = 0; i < WEAPON_KEYS.length; i++) {
        var wk = WEAPON_KEYS[i];
        if (!weapons[wk]) pool.push({ id: "w:" + wk, kind: "weapon", key: wk, level: 0, isNew: true });
      }
    }
    for (var pi = 0; pi < PASSIVE_KEYS.length; pi++) {
      var pk = PASSIVE_KEYS[pi], lv = P.passives[pk] || 0;
      if (lv < PASSIVE_MAX_LV) pool.push({ id: "p:" + pk, kind: "passive", key: pk, level: lv, isNew: lv === 0 });
    }
    // shuffle and take 3
    for (var s = pool.length - 1; s > 0; s--) { var r = (Math.random() * (s + 1)) | 0; var tmp = pool[s]; pool[s] = pool[r]; pool[r] = tmp; }
    var out = pool.slice(0, 3).map(function (c) {
      var meta = c.kind === "weapon" ? WEAPON_META[c.key] : PASSIVE_META[c.key];
      return {
        id: c.id, icon: meta.icon, name: meta.name, desc: meta.desc,
        sub: c.isNew ? "NEW" : "Lv " + (c.level + 1), isNew: !!c.isNew
      };
    });
    if (!out.length) out.push({ id: "heal", icon: "❤", name: "癒やしの光", desc: "HPを40%回復", sub: "" });
    return out;
  }

  function triggerLevelUp() {
    phase = "levelup";
    cancelAnimationFrame(rafId);
    if (global.SFX) SFX.lumLevel();
    cb.onLevelUp && cb.onLevelUp(rollChoices(), applyChoice);
  }

  function applyChoice(id) {
    if (id === "heal") { P.hp = Math.min(P.hpMax, P.hp + P.hpMax * 0.4); }
    else {
      var kind = id.slice(0, 1), key = id.slice(2);
      if (kind === "w") { if (weapons[key]) weapons[key].level++; else addWeapon(key); }
      else { P.passives[key] = (P.passives[key] || 0) + 1; recompute(); }
    }
    pendingLevels--;
    emitWeapons(); emitStats();
    if (pendingLevels > 0) { cb.onLevelUp && cb.onLevelUp(rollChoices(), applyChoice); return; }
    phase = "play"; lastT = 0;
    rafId = requestAnimationFrame(frame);
  }

  // ---------- effects ----------
  function burst(x, y, color, n, scale) {
    scale = scale || 2;
    for (var i = 0; i < n; i++) {
      var a = rand(0, TAU), sp = rand(40, 200) * scale * 0.5;
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.7), maxLife: 0.7, color: color, r: rand(1.5, 3.5) * scale });
    }
  }
  function spawnText(x, y, txt, color, size) { texts.push({ x: x, y: y, txt: "" + txt, color: color, size: size || 13, vy: -34, life: 0.8 }); }
  function addShake(m) { shake.mag = Math.max(shake.mag, m); shake.t = 0.28; }

  // ---------- callbacks to host ----------
  function emitStats() {
    cb.onStats && cb.onStats({ hp: Math.max(0, P.hp), hpMax: P.hpMax, time: Math.floor(elapsed), level: level, xp: xp, xpNext: xpNext, kills: kills });
  }
  function emitWeapons() {
    if (!cb.onWeapons) return;
    var list = [];
    for (var k in weapons) list.push({ icon: WEAPON_META[k].icon, name: WEAPON_META[k].name, level: weapons[k].level });
    cb.onWeapons(list);
  }

  function gameOver() {
    running = false; phase = "dead";
    cancelAnimationFrame(rafId);
    burst(P.x, P.y, "#9bffe9", 50, 4); addShake(10);
    if (global.SFX) SFX.death();
    cb.onGameOver && cb.onGameOver({ time: Math.floor(elapsed), level: level, kills: kills });
  }

  // ---------- rendering ----------
  function render() {
    var sx = 0, sy = 0;
    if (shake.t > 0) { sx = rand(-shake.mag, shake.mag); sy = rand(-shake.mag, shake.mag); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // background
    ctx.fillStyle = bgGrad || "#05060f";
    ctx.fillRect(0, 0, cw, ch);
    drawMotes();

    ctx.save();
    ctx.translate(cw / 2 - cam.x + sx, ch / 2 - cam.y + sy);
    drawGrid();
    drawWorld();
    ctx.restore();

    // overlays in screen space
    drawVignette();
    if (flash > 0) { ctx.fillStyle = "rgba(255,40,70," + (flash * 0.4) + ")"; ctx.fillRect(0, 0, cw, ch); }
    drawJoystick();
  }

  function drawGrid() {
    var G = 150;
    var x0 = Math.floor((cam.x - cw) / G) * G, x1 = cam.x + cw;
    var y0 = Math.floor((cam.y - ch) / G) * G, y1 = cam.y + ch;
    ctx.strokeStyle = "rgba(90,120,220,0.06)"; ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = x0; x <= x1; x += G) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (var y = y0; y <= y1; y += G) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();
  }

  function drawWorld() {
    var i;
    // gems
    ctx.globalCompositeOperation = "lighter";
    for (i = 0; i < gems.length; i++) {
      var gm = gems[i];
      var spr = gm.tier === 2 ? sprites.gem2 : (gm.tier === 1 ? sprites.gem1 : sprites.gem0);
      var pulse = 1 + Math.sin(gm.t * 6) * 0.12;
      drawSpr(spr, gm.x, gm.y, 22 * pulse);
    }
    // drops
    for (i = 0; i < drops.length; i++) {
      var dr = drops[i];
      drawSpr(dr.kind === "heart" ? sprites.heart : sprites.magnet, dr.x, dr.y + Math.sin(dr.bob) * 3, 30);
    }
    ctx.globalCompositeOperation = "source-over";

    // enemies (body), tinted-flash when hit
    for (i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var size = e.r * 2.6 + Math.sin(e.wob) * 2;
      drawSpr(sprites[e.spr], e.x, e.y, size);
      if (e.flash > 0) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = e.flash * 4; drawSpr(sprites[e.spr], e.x, e.y, size); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; }
      if (e.boss) drawHpBar(e);
    }

    ctx.globalCompositeOperation = "lighter";
    // aura ring (if owned)
    if (weapons.aura) {
      var ar = weapons.aura._radius || 60;
      var ag = ctx.createRadialGradient(P.x, P.y, ar * 0.4, P.x, P.y, ar);
      ag.addColorStop(0, "rgba(56,225,201,0)"); ag.addColorStop(0.8, "rgba(56,225,201,0.10)"); ag.addColorStop(1, "rgba(155,255,233,0.25)");
      ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(P.x, P.y, ar, 0, TAU); ctx.fill();
    }
    // novas
    for (i = 0; i < novas.length; i++) {
      var no = novas[i]; var a = 1 - no.r / no.maxR;
      ctx.strokeStyle = "rgba(155,255,233," + (a * 0.8) + ")"; ctx.lineWidth = 6 * a + 2;
      ctx.beginPath(); ctx.arc(no.x, no.y, no.r, 0, TAU); ctx.stroke();
    }
    // halo orbs
    if (weapons.halo && weapons.halo._orbs) {
      for (i = 0; i < weapons.halo._orbs.length; i++) { var o = weapons.halo._orbs[i]; drawSpr(sprites.orb, o[0], o[1], 26); }
    }
    // projectiles
    for (i = 0; i < shots.length; i++) { var p = shots[i]; drawSpr(sprites.bolt, p.x, p.y, 22); }
    // lightning
    for (i = 0; i < bolts.length; i++) {
      var bl = bolts[i]; ctx.strokeStyle = "rgba(180,220,255," + (bl.life * 5) + ")"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(bl.x1, bl.y1);
      var midx = (bl.x1 + bl.x2) / 2 + rand(-12, 12), midy = (bl.y1 + bl.y2) / 2 + rand(-12, 12);
      ctx.lineTo(midx, midy); ctx.lineTo(bl.x2, bl.y2); ctx.stroke();
    }
    // meteor target markers + incoming streak
    for (i = 0; i < meteors.length; i++) {
      var mo = meteors[i]; var fp = 1 - mo.fall / 0.85;
      ctx.strokeStyle = "rgba(255,210,74,0.6)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mo.x, mo.y, mo.aoe * (0.4 + fp * 0.6), 0, TAU); ctx.stroke();
      var streak = (1 - fp) * 300;
      ctx.strokeStyle = "rgba(255,230,150,0.9)"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(mo.x + streak, mo.y - streak); ctx.lineTo(mo.x + streak * 0.5, mo.y - streak * 0.5); ctx.stroke();
    }
    // particles
    for (i = 0; i < parts.length; i++) {
      var pt = parts[i]; ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // player
    var inv = P.inv > 0 && (((P.inv * 20) | 0) % 2 === 0);
    if (!inv) {
      ctx.globalCompositeOperation = "lighter";
      var pulse = 1 + Math.sin(elapsed * 5) * 0.06;
      drawSpr(sprites.player, P.x, P.y, 56 * pulse);
      ctx.globalCompositeOperation = "source-over";
    }

    // damage texts (screen-readable, drawn in world space)
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (i = 0; i < texts.length; i++) {
      var tt = texts[i]; ctx.globalAlpha = clamp(tt.life / 0.8, 0, 1);
      ctx.fillStyle = tt.color; ctx.font = "900 " + tt.size + "px system-ui, sans-serif";
      ctx.fillText(tt.txt, tt.x, tt.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawHpBar(e) {
    var w = e.r * 2.4, h = 5, x = e.x - w / 2, y = e.y - e.r - 16;
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#ffd24a"; ctx.fillRect(x, y, w * clamp(e.hp / e.hpMax, 0, 1), h);
  }

  function drawSpr(spr, x, y, size) {
    if (spr) ctx.drawImage(spr, x - size / 2, y - size / 2, size, size);
    else { ctx.beginPath(); ctx.arc(x, y, size / 3, 0, TAU); ctx.fill(); }
  }

  function drawMotes() {
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      m.x += m.vx; m.y += m.vy;
      if (m.x < -10) m.x = cw + 10; else if (m.x > cw + 10) m.x = -10;
      if (m.y < -10) m.y = ch + 10; else if (m.y > ch + 10) m.y = -10;
      ctx.globalAlpha = m.a;
      ctx.fillStyle = m.c;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function drawVignette() { if (vignette) { ctx.fillStyle = vignette; ctx.fillRect(0, 0, cw, ch); } }

  // ---------- input ----------
  var joy = { active: false, id: null, bx: 0, by: 0, nx: 0, ny: 0 };
  var keys = {};
  function keyVec() {
    var x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    var y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    move.x = x; move.y = y;
  }
  function onKey(e, down) {
    var c = e.code;
    if (c === "ArrowLeft" || c === "KeyA") keys.left = down;
    else if (c === "ArrowRight" || c === "KeyD") keys.right = down;
    else if (c === "ArrowUp" || c === "KeyW") keys.up = down;
    else if (c === "ArrowDown" || c === "KeyS") keys.down = down;
    else return;
    e.preventDefault(); keyVec();
  }
  function ptXY(ev) {
    var r = canvas.getBoundingClientRect();
    var t = ev.touches ? ev.touches[0] : ev;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function onDown(e) {
    if (e.cancelable) e.preventDefault();
    var p = ptXY(e);
    joy.active = true; joy.bx = p.x; joy.by = p.y; joy.nx = 0; joy.ny = 0;
  }
  function onMove(e) {
    if (!joy.active) return;
    if (e.cancelable) e.preventDefault();
    var p = ptXY(e);
    var dx = p.x - joy.bx, dy = p.y - joy.by, d = hypot(dx, dy);
    var max = 56;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    joy.nx = dx / max; joy.ny = dy / max;
    move.x = joy.nx; move.y = joy.ny;
  }
  function onUp() { joy.active = false; joy.nx = joy.ny = 0; if (!keys.left && !keys.right && !keys.up && !keys.down) { move.x = 0; move.y = 0; } }

  function drawJoystick() {
    if (!joy.active) return;
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(56,225,201,0.4)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(joy.bx, joy.by, 56, 0, TAU); ctx.stroke();
    ctx.fillStyle = "rgba(155,255,233,0.5)";
    ctx.beginPath(); ctx.arc(joy.bx + joy.nx * 56, joy.by + joy.ny * 56, 22, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  var bound = false;
  function bindInput() {
    canvas.addEventListener("touchstart", onDown, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onUp);
    canvas.addEventListener("touchcancel", onUp);
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", function (e) { onKey(e, true); });
    window.addEventListener("keyup", function (e) { onKey(e, false); });
  }

  // ---------- resize / loop ----------
  function resize() {
    dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    cw = canvas.clientWidth || 360; ch = canvas.clientHeight || 720;
    canvas.width = Math.floor(cw * dpr); canvas.height = Math.floor(ch * dpr);
    // perf budget scales with screen area
    MAX_ENEMIES = Math.min(220, Math.max(90, Math.floor(cw * ch / 2600)));
    rebuildBackdrop();
  }

  function rebuildBackdrop() {
    try {
      var g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, "#0a0a18"); g.addColorStop(0.6, "#070611"); g.addColorStop(1, "#03020a");
      bgGrad = g;
      var v = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,8,0.78)");
      vignette = v;
    } catch (e) { bgGrad = "#05060f"; vignette = null; }
    motes = [];
    var n = Math.floor(cw * ch / 16000);
    for (var i = 0; i < n; i++) {
      var hot = Math.random() < 0.3;
      motes.push({
        x: rand(0, cw), y: rand(0, ch), vx: rand(-0.15, 0.15), vy: rand(-0.25, -0.05),
        r: rand(0.6, hot ? 2.2 : 1.4), a: rand(0.05, 0.3),
        c: hot ? "rgba(108,140,255,0.9)" : "rgba(155,255,233,0.7)"
      });
    }
  }

  function frame(ts) {
    if (!running || phase !== "play") return;
    var dt = lastT ? (ts - lastT) / 1000 : 0;
    lastT = ts;
    dt = clamp(dt, 0, 0.05);
    update(dt);
    if (phase === "play") { render(); rafId = requestAnimationFrame(frame); }
  }

  // ---------- public API ----------
  var LuminaGame = {
    start: function (cnv, opts) {
      cb = opts || {};
      canvas = cnv; ctx = canvas.getContext("2d");
      buildSprites();
      keys = {}; move.x = move.y = 0; joy.active = false;
      resize();
      window.addEventListener("resize", resize);
      if (!bound) { bindInput(); bound = true; }
      initWorld();
      phase = "play"; running = true; lastT = 0;
      rafId = requestAnimationFrame(frame);
    },
    setMove: function (x, y) { move.x = x; move.y = y; },
    pause: function () { if (phase === "play") { phase = "paused"; cancelAnimationFrame(rafId); } },
    resume: function () { if (phase === "paused") { phase = "play"; lastT = 0; rafId = requestAnimationFrame(frame); } },
    isPlaying: function () { return running; },
    isPaused: function () { return phase === "paused" || phase === "levelup"; },
    stop: function () {
      running = false; phase = "idle"; cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    }
  };

  global.LuminaGame = LuminaGame;
})(window);
