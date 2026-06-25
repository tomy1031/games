/* ルミナ・サバイバー (Lumina Survivor) — an original-world Vampire-Survivors-like.
   You are the last Lumina, a luminous guardian in a world swallowed by the
   eternal night "Tokoyami". Move to survive; your light-weapons fire on their
   own. Slain shades drop lux shards (XP) — level up to pick new powers.

   This file is the data-driven ENGINE. Content lives in registries:
     window.LUMINA_WEAPONS / LUMINA_PASSIVES / LUMINA_CHARACTERS /
     window.LUMINA_STAGES  / LUMINA_ENEMIES
   If a registry is missing the engine falls back to a built-in set, so the
   game always runs. Weapons are expressed as ARCHETYPE + params (no per-weapon
   code in content), passives as a STAT effect, which keeps content pure data.

   Public API on window.LuminaGame: start, pause, resume, stop, isPlaying,
   isPaused, setMove, getCharacters, getStages. */
(function (global) {
  "use strict";

  // ---------- math helpers ----------
  var TAU = Math.PI * 2;
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function hypot(x, y) { return Math.sqrt(x * x + y * y); }
  function pickOne(a) { return a[(Math.random() * a.length) | 0]; }
  function angDiff(a, b) { var d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

  // ---------- tunables ----------
  var BASE_SPEED = 138, BASE_HP = 100, BASE_MAGNET = 78;
  var IFRAME = 0.55, MAX_WEAPONS = 6, WEAPON_MAX_LV = 8, PASSIVE_MAX_LV = 6;

  // ============================================================
  //  BUILT-IN CONTENT (fallback; overridden by window.LUMINA_*)
  // ============================================================
  var BUILTIN_WEAPONS = [
    { key: "bolt", name: "ルクス弾", icon: "💫", color: "#9bffe9", archetype: "shot", maxLevel: 8,
      desc: "最も近い敵へ光弾を自動発射", evolvesTo: "bolt_x", evolveWith: "power",
      params: { interval: 0.92, intervalPer: -0.05, intervalMin: 0.22, dmg: 7, dmgPer: 3.2, count: 1, countPer: 0.5, pierce: 0, piercePer: 0.34, speed: 420, projR: 8 } },
    { key: "bolt_x", name: "プリズム・ランス", icon: "🌈", color: "#bfffff", archetype: "shot", maxLevel: 8, hidden: true,
      desc: "全てを貫く極光の槍", evolvesTo: null, evolveWith: null,
      params: { interval: 0.5, intervalPer: -0.03, intervalMin: 0.16, dmg: 16, dmgPer: 5, count: 3, countPer: 0.5, pierce: 99, speed: 540, projR: 11 } },
    { key: "halo", name: "光輪", icon: "🪐", color: "#b9c4ff", archetype: "orbit", maxLevel: 8,
      desc: "周囲を回る光のオーブ", evolvesTo: "halo_x", evolveWith: "area",
      params: { count: 2, countPer: 0.6, dmg: 5, dmgPer: 2.4, radius: 66, radiusPer: 7, spin: 1.9, orbR: 17, tickCd: 0.12 } },
    { key: "halo_x", name: "オーロラ環", icon: "💍", color: "#9bffb0", archetype: "orbit", maxLevel: 8, hidden: true,
      desc: "極光を纏う高速の輪", evolvesTo: null, evolveWith: null,
      params: { count: 5, countPer: 0.6, dmg: 11, dmgPer: 3.4, radius: 92, radiusPer: 8, spin: 3.0, orbR: 24, tickCd: 0.1 } },
    { key: "aura", name: "聖環", icon: "🔆", color: "#38e1c9", archetype: "aura", maxLevel: 8,
      desc: "身を包む光が触れた敵を焼く", evolvesTo: "aura_x", evolveWith: "duration",
      params: { radius: 60, radiusPer: 10, dmg: 3, dmgPer: 2, tick: 0.4 } },
    { key: "aura_x", name: "白夜の輪", icon: "☀", color: "#fff1a8", archetype: "zone", maxLevel: 8, hidden: true,
      desc: "消えぬ白光が周囲を灼く", evolvesTo: null, evolveWith: null,
      params: { interval: 0.6, intervalMin: 0.6, dmg: 9, dmgPer: 3, r: 120, rPer: 10, life: 1.2, tick: 0.25, follow: true, slow: 0.7, slowDur: 0.4 } },
    { key: "nova", name: "新星", icon: "💥", color: "#9bffe9", archetype: "nova", maxLevel: 8,
      desc: "周期的に光の衝撃波を放つ", evolvesTo: "nova_x", evolveWith: "haste",
      params: { interval: 2.6, intervalPer: -0.12, intervalMin: 1.0, dmg: 9, dmgPer: 4.5, maxR: 150, maxRPer: 22, speed: 520, kb: 120 } },
    { key: "nova_x", name: "超新星", icon: "🌟", color: "#ffd24a", archetype: "nova", maxLevel: 8, hidden: true,
      desc: "灼熱の余波を残す大爆発", evolvesTo: null, evolveWith: null,
      params: { interval: 1.8, intervalPer: -0.1, intervalMin: 0.8, dmg: 18, dmgPer: 6, maxR: 230, maxRPer: 24, speed: 620, kb: 200, leavesZone: true, zoneDmg: 10, zoneLife: 2.2 } },
    { key: "spark", name: "連鎖雷", icon: "⚡", color: "#b8dcff", archetype: "chain", maxLevel: 8,
      desc: "敵から敵へ飛び移る稲妻", evolvesTo: "spark_x", evolveWith: "power",
      params: { interval: 1.7, intervalPer: -0.07, intervalMin: 0.6, jumps: 3, jumpsPer: 1, dmg: 7, dmgPer: 3, range: 220, stunDur: 0 } },
    { key: "spark_x", name: "天雷", icon: "🌩", color: "#dff0ff", archetype: "chain", maxLevel: 8, hidden: true,
      desc: "天を裂き連なる雷霆", evolvesTo: null, evolveWith: null,
      params: { interval: 1.0, intervalPer: -0.05, intervalMin: 0.4, jumps: 8, jumpsPer: 1, dmg: 16, dmgPer: 4, range: 300, stunDur: 0.5 } },
    { key: "star", name: "流星", icon: "☄", color: "#ffd24a", archetype: "meteor", maxLevel: 8,
      desc: "空から光の流星が降り注ぐ", evolvesTo: "star_x", evolveWith: "area",
      params: { interval: 2.4, intervalPer: -0.09, intervalMin: 1.0, count: 1, countPer: 0.5, aoe: 70, aoePer: 8, dmg: 12, dmgPer: 6 } },
    { key: "star_x", name: "流星群", icon: "🌠", color: "#ffe27a", archetype: "meteor", maxLevel: 8, hidden: true,
      desc: "夜空を埋め尽くす流星の雨", evolvesTo: null, evolveWith: null,
      params: { interval: 1.4, intervalPer: -0.06, intervalMin: 0.6, count: 4, countPer: 0.7, aoe: 96, aoePer: 9, dmg: 20, dmgPer: 7 } }
  ];
  var BUILTIN_PASSIVES = [
    { key: "power",  name: "炎心",   icon: "🔥", maxLevel: 6, stat: "dmgMul", per: 0.12, mode: "add", desc: "与ダメージ +12%" },
    { key: "haste",  name: "疾撃",   icon: "⏱", maxLevel: 6, stat: "cdMul", per: -0.07, mode: "add", desc: "攻撃の間隔 -7%" },
    { key: "swift",  name: "韋駄天", icon: "👟", maxLevel: 6, stat: "speedMul", per: 0.08, mode: "add", desc: "移動速度 +8%" },
    { key: "vigor",  name: "生命",   icon: "❤", maxLevel: 6, stat: "hpMaxBonus", per: 22, mode: "add", desc: "最大HP +22" },
    { key: "regen",  name: "再生",   icon: "✚", maxLevel: 6, stat: "regen", per: 0.5, mode: "add", desc: "毎秒HP回復 +0.5" },
    { key: "magnet", name: "引力",   icon: "🧲", maxLevel: 6, stat: "magnetMul", per: 0.25, mode: "add", desc: "取得範囲 +25%" },
    { key: "guard",  name: "加護",   icon: "🛡", maxLevel: 6, stat: "armor", per: 0.05, mode: "add", desc: "被ダメージ -5%" },
    { key: "greed",  name: "宝眼",   icon: "🔮", maxLevel: 6, stat: "xpMul", per: 0.10, mode: "add", desc: "経験値 +10%" },
    { key: "area",   name: "拡張",   icon: "🌀", maxLevel: 6, stat: "areaMul", per: 0.10, mode: "add", desc: "武器の範囲 +10%" },
    { key: "velocity", name: "迅速", icon: "🎯", maxLevel: 6, stat: "projSpeedMul", per: 0.12, mode: "add", desc: "弾速 +12%" },
    { key: "duration", name: "持続", icon: "⏳", maxLevel: 6, stat: "durationMul", per: 0.12, mode: "add", desc: "効果時間 +12%" },
    { key: "multi",  name: "増幅",   icon: "✴", maxLevel: 3, stat: "amount", per: 1, mode: "add", desc: "投射数 +1" }
  ];
  var BUILTIN_CHARACTERS = [
    { key: "lux", name: "ルクス", title: "灯火の守人", icon: "🌟", color: "#9bffe9", startWeapon: "bolt",
      desc: "均整のとれた標準の守人。", stats: {}, unlock: { type: "default" }, unlockHint: "" },
    { key: "vela", name: "ヴェラ", title: "疾風の射手", icon: "🏹", color: "#6c8cff", startWeapon: "bolt",
      desc: "速いが脆い。一撃離脱の達人。", stats: { speedMul: 1.28, cdMul: 0.9, hpMul: 0.82 }, unlock: { type: "default" }, unlockHint: "" },
    { key: "ignis", name: "イグニス", title: "灼熱の使徒", icon: "🔥", color: "#ff9a3d", startWeapon: "nova",
      desc: "高火力だが打たれ弱い。", stats: { dmgMul: 1.25, hpMul: 0.72, areaMul: 1.1 }, unlock: { type: "level", n: 12 }, unlockHint: "1回のプレイで Lv12 到達で解放" }
  ];
  var BUILTIN_ENEMIES = [
    { key: "shade", hp: 8,  speed: 48, dmg: 7,  r: 14, xp: 1, color: "#b070ff", spr: "shade", boss: false },
    { key: "wisp",  hp: 5,  speed: 98, dmg: 5,  r: 11, xp: 1, color: "#ff6cd8", spr: "wisp", boss: false },
    { key: "mite",  hp: 3,  speed: 120, dmg: 4, r: 9,  xp: 1, color: "#7fe6d0", spr: "mite", boss: false },
    { key: "brute", hp: 52, speed: 31, dmg: 15, r: 24, xp: 5, color: "#5fa0ff", spr: "brute", boss: false },
    { key: "ghast", hp: 26, speed: 60, dmg: 11, r: 17, xp: 3, color: "#9bffb0", spr: "ghast", boss: false },
    { key: "golem", hp: 110, speed: 24, dmg: 20, r: 30, xp: 9, color: "#ff9a3d", spr: "golem", boss: false },
    { key: "boss1", hp: 300, speed: 40, dmg: 20, r: 42, xp: 70, color: "#ffd24a", spr: "boss", boss: true },
    { key: "boss2", hp: 360, speed: 40, dmg: 22, r: 44, xp: 80, color: "#ff6cd8", spr: "boss3", boss: true },
    { key: "boss3", hp: 420, speed: 42, dmg: 23, r: 46, xp: 90, color: "#ff5d7a", spr: "boss2", boss: true },
    { key: "boss4", hp: 520, speed: 42, dmg: 24, r: 48, xp: 100, color: "#6c8cff", spr: "boss", boss: true },
    { key: "boss5", hp: 660, speed: 44, dmg: 26, r: 50, xp: 110, color: "#b070ff", spr: "boss3", boss: true },
    { key: "boss6", hp: 900, speed: 44, dmg: 28, r: 54, xp: 140, color: "#ffd24a", spr: "boss2", boss: true }
  ];
  function builtinStage(key, n, name, desc, icon, cols, spawn, roster, boss, unlock, hint) {
    return { key: key, name: name, desc: desc, icon: icon, theme: "stage" + n, durationGoal: 240 + n * 60,
      bg: cols, spawn: spawn, roster: roster, boss: boss, unlock: unlock, unlockHint: hint };
  }
  var BUILTIN_STAGES = [
    builtinStage("stage1", 1, "黄昏の草原", "夜の始まり。穏やかな草原。", "🌾",
      { top: "#0e1430", mid: "#0a0f24", bot: "#05060f", grid: "rgba(120,150,255,0.06)", moteHot: "rgba(120,160,255,0.8)", moteCool: "rgba(155,255,233,0.6)", vignette: "rgba(0,0,10,0.7)" },
      { rateMul: 1, hpMul: 1, dmgMul: 1, batchMul: 1 },
      [{ type: "shade", from: 0, weight: 5 }, { type: "wisp", from: 45, weight: 3 }, { type: "mite", from: 80, weight: 3 }, { type: "brute", from: 150, weight: 1 }],
      "boss1", { type: "default" }, ""),
    builtinStage("stage2", 2, "常闇の樹海", "光を呑む深い森。", "🌲",
      { top: "#10261c", mid: "#091a14", bot: "#040b08", grid: "rgba(120,255,180,0.06)", moteHot: "rgba(155,255,176,0.8)", moteCool: "rgba(120,220,255,0.5)", vignette: "rgba(0,8,4,0.74)" },
      { rateMul: 1.1, hpMul: 1.25, dmgMul: 1.1, batchMul: 1.1 },
      [{ type: "shade", from: 0, weight: 4 }, { type: "ghast", from: 20, weight: 3 }, { type: "wisp", from: 30, weight: 3 }, { type: "brute", from: 90, weight: 2 }],
      "boss2", { type: "clear", stage: "stage1" }, "「黄昏の草原」をクリアで解放"),
    builtinStage("stage3", 3, "凍てつく霊峰", "凍れる静寂の頂。", "🏔",
      { top: "#0c1d33", mid: "#0a1626", bot: "#04080f", grid: "rgba(150,210,255,0.07)", moteHot: "rgba(200,240,255,0.85)", moteCool: "rgba(150,200,255,0.5)", vignette: "rgba(0,6,16,0.74)" },
      { rateMul: 1.15, hpMul: 1.5, dmgMul: 1.2, batchMul: 1.2 },
      [{ type: "shade", from: 0, weight: 3 }, { type: "wisp", from: 0, weight: 4 }, { type: "ghast", from: 30, weight: 3 }, { type: "golem", from: 120, weight: 1 }],
      "boss3", { type: "clear", stage: "stage2" }, "「常闇の樹海」をクリアで解放"),
    builtinStage("stage4", 4, "灰の都", "崩れた文明の残響。", "🏚",
      { top: "#231a12", mid: "#16100b", bot: "#070504", grid: "rgba(255,180,120,0.06)", moteHot: "rgba(255,180,90,0.8)", moteCool: "rgba(200,160,140,0.5)", vignette: "rgba(8,4,0,0.76)" },
      { rateMul: 1.3, hpMul: 1.7, dmgMul: 1.3, batchMul: 1.3 },
      [{ type: "shade", from: 0, weight: 3 }, { type: "brute", from: 0, weight: 2 }, { type: "ghast", from: 20, weight: 3 }, { type: "golem", from: 60, weight: 2 }],
      "boss4", { type: "clear", stage: "stage3" }, "「凍てつく霊峰」をクリアで解放"),
    builtinStage("stage5", 5, "血染めの月", "赤い月が狂気を呼ぶ。", "🌑",
      { top: "#2a0e16", mid: "#1a070d", bot: "#080203", grid: "rgba(255,120,140,0.06)", moteHot: "rgba(255,110,130,0.8)", moteCool: "rgba(180,90,120,0.5)", vignette: "rgba(10,0,2,0.78)" },
      { rateMul: 1.45, hpMul: 1.95, dmgMul: 1.45, batchMul: 1.45 },
      [{ type: "wisp", from: 0, weight: 4 }, { type: "ghast", from: 0, weight: 3 }, { type: "brute", from: 20, weight: 3 }, { type: "golem", from: 50, weight: 2 }],
      "boss5", { type: "clear", stage: "stage4" }, "「灰の都」をクリアで解放"),
    builtinStage("stage6", 6, "夜明け前", "最も暗い刻。夜明けは近い。", "🌅",
      { top: "#1a1330", mid: "#0d0a1e", bot: "#040208", grid: "rgba(180,160,255,0.07)", moteHot: "rgba(255,210,120,0.85)", moteCool: "rgba(160,150,255,0.6)", vignette: "rgba(4,2,10,0.8)" },
      { rateMul: 1.6, hpMul: 2.2, dmgMul: 1.6, batchMul: 1.6 },
      [{ type: "wisp", from: 0, weight: 3 }, { type: "ghast", from: 0, weight: 3 }, { type: "brute", from: 0, weight: 3 }, { type: "golem", from: 30, weight: 3 }],
      "boss6", { type: "clear", stage: "stage5" }, "「血染めの月」をクリアで解放")
  ];

  // ---------- registry resolution ----------
  var WEAPONS = {}, PASSIVES = {}, ENEMIES = {}, CHARACTERS = [], STAGES = [];
  function indexBy(arr, key) { var m = {}; for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i][key]) m[arr[i][key]] = arr[i]; return m; }
  function resolveRegistries() {
    var w = (global.LUMINA_WEAPONS && global.LUMINA_WEAPONS.length) ? global.LUMINA_WEAPONS : BUILTIN_WEAPONS;
    var p = (global.LUMINA_PASSIVES && global.LUMINA_PASSIVES.length) ? global.LUMINA_PASSIVES : BUILTIN_PASSIVES;
    var e = (global.LUMINA_ENEMIES && global.LUMINA_ENEMIES.length) ? global.LUMINA_ENEMIES : BUILTIN_ENEMIES;
    CHARACTERS = (global.LUMINA_CHARACTERS && global.LUMINA_CHARACTERS.length) ? global.LUMINA_CHARACTERS : BUILTIN_CHARACTERS;
    STAGES = (global.LUMINA_STAGES && global.LUMINA_STAGES.length) ? global.LUMINA_STAGES : BUILTIN_STAGES;
    WEAPONS = indexBy(w, "key"); PASSIVES = indexBy(p, "key"); ENEMIES = indexBy(e, "key");
    // guarantee the core enemy/sprite set exists even if content omits some
    for (var i = 0; i < BUILTIN_ENEMIES.length; i++) { var be = BUILTIN_ENEMIES[i]; if (!ENEMIES[be.key]) ENEMIES[be.key] = be; }
  }
  // pickable (non-hidden) weapon keys
  function pickableWeaponKeys() { var out = []; for (var k in WEAPONS) if (!WEAPONS[k].hidden) out.push(k); return out; }
  function passiveKeys() { var out = []; for (var k in PASSIVES) out.push(k); return out; }

  // ---------- module state ----------
  var canvas, ctx, dpr = 1, cw = 0, ch = 0;
  var cb = {};
  var running = false, phase = "idle";
  var rafId = 0, lastT = 0, elapsed = 0;

  var P = null;
  var cam = { x: 0, y: 0 };
  var shake = { mag: 0, t: 0 };
  var move = { x: 0, y: 0 };

  var enemies, gems, drops, shots, novas, meteors, bolts, zones, arcs, parts, texts;
  var weapons;
  var level, xp, xpNext, kills, bossKills, bossAlive, pendingLevels;
  var bossTimer, swarmTimer, spawnTimer, flash, cleared;
  var curChar, curStage;

  var MAX_ENEMIES = 180;
  var sprites = {}, spritesOK = false, glowCache = {};
  var bgGrad = null, vignette = null, motes = [], stageBg = null;

  // ============================================================
  //  sprite baking
  // ============================================================
  function makeCanvas(w, h) {
    if (typeof document === "undefined" || !document.createElement) return null;
    var c = document.createElement("canvas"); c.width = w; c.height = h; return c;
  }
  function bake(w, h, draw) {
    var c = makeCanvas(w, h); if (!c) return null;
    var g = c.getContext("2d"); if (!g) return null; draw(g, w, h); return c;
  }
  function radial(g, x, y, r, stops) {
    var grd = g.createRadialGradient(x, y, 0, x, y, r);
    for (var i = 0; i < stops.length; i++) grd.addColorStop(stops[i][0], stops[i][1]);
    return grd;
  }
  function hexA(hex, a) {
    if (!hex || hex[0] !== "#") return hex || "rgba(255,255,255," + a + ")";
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function tintGlow(color) {
    if (glowCache[color] !== undefined) return glowCache[color];
    var c = bake(32, 32, function (g) {
      g.fillStyle = radial(g, 16, 16, 16, [[0, "#ffffff"], [0.35, hexA(color, 0.95)], [1, hexA(color, 0)]]);
      g.fillRect(0, 0, 32, 32);
    });
    glowCache[color] = c; return c;
  }

  function enemyBlob(rim, body, scale, crack, eyes) {
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
      }
      if (eyes !== false) {
        g.fillStyle = "#fff"; g.beginPath(); g.arc(26, 30, 3.2, 0, TAU); g.arc(38, 30, 3.2, 0, TAU); g.fill();
        g.fillStyle = rim; g.beginPath(); g.arc(26, 30, 1.6, 0, TAU); g.arc(38, 30, 1.6, 0, TAU); g.fill();
      }
    });
  }
  function bossSprite(glow, body, crown, eye) {
    return bake(128, 128, function (g) {
      g.fillStyle = radial(g, 64, 64, 64, [[0, hexA(glow, 0.95)], [0.3, hexA(glow, 0.5)], [1, hexA(glow, 0)]]);
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = body; g.beginPath(); g.arc(64, 68, 36, 0, TAU); g.fill();
      g.fillStyle = crown;
      for (var i = 0; i < 7; i++) {
        var a = -Math.PI / 2 + (i - 3) * 0.5;
        g.beginPath();
        g.moveTo(64 + Math.cos(a) * 32, 68 + Math.sin(a) * 32);
        g.lineTo(64 + Math.cos(a) * 54, 68 + Math.sin(a) * 54);
        g.lineTo(64 + Math.cos(a + 0.18) * 32, 68 + Math.sin(a + 0.18) * 32);
        g.closePath(); g.fill();
      }
      g.fillStyle = eye; g.beginPath(); g.arc(53, 62, 5.5, 0, TAU); g.arc(75, 62, 5.5, 0, TAU); g.fill();
    });
  }
  function gemSprite(light, dark) {
    return bake(28, 28, function (g) {
      g.fillStyle = radial(g, 14, 14, 14, [[0, hexA(light, 0.9)], [1, hexA(light, 0)]]); g.fillRect(0, 0, 28, 28);
      g.fillStyle = light; g.beginPath(); g.moveTo(14, 4); g.lineTo(23, 14); g.lineTo(14, 24); g.lineTo(5, 14); g.closePath(); g.fill();
      g.fillStyle = dark; g.beginPath(); g.moveTo(14, 14); g.lineTo(23, 14); g.lineTo(14, 24); g.closePath(); g.fill();
    });
  }
  function heartPath(g, x, y, s) {
    g.beginPath(); g.moveTo(x, y + s * 0.7);
    g.bezierCurveTo(x - s * 1.4, y - s * 0.5, x - s * 0.5, y - s * 1.2, x, y - s * 0.3);
    g.bezierCurveTo(x + s * 0.5, y - s * 1.2, x + s * 1.4, y - s * 0.5, x, y + s * 0.7); g.closePath();
  }

  function buildSprites() {
    if (spritesOK) return;
    sprites = {};
    sprites.player = bake(120, 120, function (g) {
      g.fillStyle = radial(g, 60, 60, 60, [[0, "rgba(180,255,245,0.9)"], [0.18, "rgba(80,230,220,0.6)"], [0.5, "rgba(56,140,255,0.25)"], [1, "rgba(56,140,255,0)"]]);
      g.fillRect(0, 0, 120, 120);
      g.fillStyle = radial(g, 60, 60, 22, [[0, "#ffffff"], [0.5, "#9bffe9"], [1, "rgba(56,225,201,0)"]]);
      g.beginPath(); g.arc(60, 60, 22, 0, TAU); g.fill();
    });
    sprites.shade = enemyBlob("#b070ff", "#2a0f4d");
    sprites.wisp = bake(56, 56, function (g) {
      g.fillStyle = radial(g, 28, 28, 28, [[0, "rgba(255,150,235,0.95)"], [0.4, "rgba(255,108,216,0.5)"], [1, "rgba(255,108,216,0)"]]);
      g.fillRect(0, 0, 56, 56);
      g.fillStyle = "#fff"; g.beginPath(); g.moveTo(28, 12); g.lineTo(40, 28); g.lineTo(28, 44); g.lineTo(16, 28); g.closePath(); g.fill();
    });
    sprites.mite = enemyBlob("#7fe6d0", "#0c3b34", 0.7);
    sprites.brute = enemyBlob("#5fa0ff", "#0b1a40", 1.4, "#7fd0ff", false);
    sprites.ghast = enemyBlob("#9bffb0", "#0c331f", 1.05);
    sprites.golem = enemyBlob("#ff9a3d", "#3a1c08", 1.55, "#ffd0a0", false);
    sprites.boss = bossSprite("#ffd24a", "#1a0e02", "#ffd24a", "#ff5d4a");
    sprites.boss2 = bossSprite("#ff5d7a", "#240409", "#ff8aa6", "#fff");
    sprites.boss3 = bossSprite("#b070ff", "#16042a", "#d3a8ff", "#fff");
    sprites.gem0 = gemSprite("#7fdfff", "#2f7fff");
    sprites.gem1 = gemSprite("#9bffb0", "#2fd07f");
    sprites.gem2 = gemSprite("#ffe27a", "#ffae2f");
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
    sprites.orb = bake(40, 40, function (g) {
      g.fillStyle = radial(g, 20, 20, 20, [[0, "#ffffff"], [0.35, "#b9c4ff"], [0.7, "rgba(108,140,255,0.5)"], [1, "rgba(108,140,255,0)"]]);
      g.fillRect(0, 0, 40, 40);
    });
    spritesOK = !!sprites.player;
  }
  function spriteFor(name) { return sprites[name] || sprites.shade; }

  // ============================================================
  //  world setup
  // ============================================================
  function findChar(key) { for (var i = 0; i < CHARACTERS.length; i++) if (CHARACTERS[i].key === key) return CHARACTERS[i]; return CHARACTERS[0]; }
  function findStage(key) { for (var i = 0; i < STAGES.length; i++) if (STAGES[i].key === key) return STAGES[i]; return STAGES[0]; }

  function initWorld(charKey, stageKey) {
    curChar = findChar(charKey); curStage = findStage(stageKey);
    var st = curChar.stats || {};
    P = {
      x: 0, y: 0, vx: 0, vy: 0,
      hp: BASE_HP, hpMax: BASE_HP, speed: BASE_SPEED, magnet: BASE_MAGNET,
      inv: 0, facing: 0, passives: {},
      dmgMul: 1, cdMul: 1, speedMul: 1, magnetMul: 1, xpMul: 1, areaMul: 1,
      projSpeedMul: 1, durationMul: 1, amount: 0, armor: 0, regen: 0, crit: 0, critMul: 2, luck: 0, hpMaxBonus: 0
    };
    cam.x = 0; cam.y = 0;
    enemies = []; gems = []; drops = []; shots = []; novas = []; meteors = []; bolts = []; zones = []; arcs = []; parts = []; texts = [];
    weapons = {};
    var sw = WEAPONS[curChar.startWeapon] ? curChar.startWeapon : pickableWeaponKeys()[0];
    addWeapon(sw);
    level = 1; xp = 0; xpNext = xpFor(1); kills = 0; bossKills = 0; bossAlive = 0; pendingLevels = 0;
    bossTimer = 60; swarmTimer = 26; spawnTimer = 0; elapsed = 0; flash = 0; cleared = false;
    shake.mag = 0; shake.t = 0;
    P.hp = P.hpMax = BASE_HP * (st.hpMul || 1);
    recompute();
    P.hp = P.hpMax;
    stageBg = curStage.bg || null;
    rebuildBackdrop();
    emitStats(); emitWeapons();
  }

  function xpFor(lv) { return Math.floor(5 + lv * 3.4 + lv * lv * 0.55); }
  function addWeapon(key) { var w = { key: key, level: 1, cd: 0.4, orbA: rand(0, TAU) }; weapons[key] = w; return w; }

  function recompute() {
    var st = curChar.stats || {};
    P.dmgMul = st.dmgMul || 1; P.cdMul = st.cdMul || 1; P.speedMul = st.speedMul || 1;
    P.magnetMul = st.magnetMul || 1; P.xpMul = st.xpMul || 1; P.areaMul = st.areaMul || 1;
    P.projSpeedMul = 1; P.durationMul = 1; P.amount = st.amount || 0; P.armor = st.armor || 0;
    P.regen = st.regen || 0; P.crit = st.crit || 0; P.critMul = 2; P.luck = st.luck || 0; P.hpMaxBonus = 0;
    for (var key in P.passives) {
      var def = PASSIVES[key]; if (!def) continue;
      var lv = P.passives[key];
      if (def.mode === "mul") P[def.stat] *= Math.pow(1 + def.per, lv);
      else P[def.stat] += def.per * lv;
    }
    P.cdMul = Math.max(0.4, P.cdMul);
    P.armor = clamp(P.armor, 0, 0.6);
    P.crit = clamp(P.crit, 0, 0.6);
    P.amount = Math.max(0, Math.round(P.amount));
    P.speed = BASE_SPEED * P.speedMul;
    P.magnet = BASE_MAGNET * P.magnetMul;
    var newMax = BASE_HP * (st.hpMul || 1) + P.hpMaxBonus;
    if (newMax > P.hpMax) P.hp = Math.min(newMax, P.hp + (newMax - P.hpMax));
    P.hpMax = newMax;
  }

  // ============================================================
  //  spawning / director (stage-aware)
  // ============================================================
  function minutes() { return elapsed / 60; }
  function spawnRing() { return Math.max(cw, ch) * 0.62 + 80; }
  function sp() { return curStage.spawn || { rateMul: 1, hpMul: 1, dmgMul: 1, batchMul: 1 }; }

  function rosterPick() {
    var r = curStage.roster, avail = [];
    if (r && r.length) {
      var tot = 0, i;
      for (i = 0; i < r.length; i++) if (elapsed >= (r[i].from || 0) && ENEMIES[r[i].type]) { avail.push(r[i]); tot += r[i].weight || 1; }
      if (avail.length) {
        var roll = Math.random() * tot;
        for (i = 0; i < avail.length; i++) { roll -= avail[i].weight || 1; if (roll <= 0) return avail[i].type; }
        return avail[avail.length - 1].type;
      }
    }
    return "shade";
  }

  function spawnEnemy(typeKey, ax, ay) {
    var d = ENEMIES[typeKey]; if (!d) return null;
    if (enemies.length >= MAX_ENEMIES && !d.boss) return null;
    var m = minutes(), s = sp();
    if (ax == null) { var ang = rand(0, TAU), dist = spawnRing() * rand(1.0, 1.12); ax = P.x + Math.cos(ang) * dist; ay = P.y + Math.sin(ang) * dist; }
    var hpMul = d.boss ? (s.hpMul * (1 + m * 0.35)) : (s.hpMul * (1 + m * 0.5));
    var e = {
      type: typeKey, x: ax, y: ay, r: d.r, color: d.color, spr: d.spr, boss: !!d.boss,
      hp: d.hp * hpMul, hpMax: d.hp * hpMul,
      speed: d.speed * (1 + m * 0.02), dmg: d.dmg * s.dmgMul * (1 + m * 0.06),
      xp: d.xp, flash: 0, kx: 0, ky: 0, wob: rand(0, TAU), slowF: 1, slowT: 0, stunT: 0
    };
    enemies.push(e);
    if (e.boss) { bossAlive++; if (bossAlive === 1 && cb.onBoss) cb.onBoss(); }
    return e;
  }

  function director(dt) {
    var m = minutes(), s = sp();
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = Math.max(0.3, (1.15 - m * 0.13) / (s.rateMul || 1));
      var batch = Math.max(1, Math.round((2 + m * 1.5) * (s.batchMul || 1)));
      for (var i = 0; i < batch; i++) spawnEnemy(rosterPick());
    }
    swarmTimer -= dt;
    if (swarmTimer <= 0) {
      swarmTimer = Math.max(14, 32 - m * 1.6);
      var n = 14 + Math.floor(m * 3), a0 = rand(0, TAU), R = spawnRing() * 1.05, t = rosterPick();
      for (var k = 0; k < n; k++) { var a = a0 + (k / n) * TAU; spawnEnemy(t, P.x + Math.cos(a) * R, P.y + Math.sin(a) * R); }
    }
    bossTimer -= dt;
    if (bossTimer <= 0) {
      bossTimer = 60;
      spawnEnemy(curStage.boss || "boss1");
      addShake(8); flash = Math.max(flash, 0.4);
      if (global.SFX) SFX.lumBoss();
    }
    if (!cleared && curStage.durationGoal && elapsed >= curStage.durationGoal) {
      cleared = true; flash = Math.max(flash, 0.5);
      if (cb.onClear) cb.onClear();
    }
  }

  // ============================================================
  //  combat helpers
  // ============================================================
  function nearest(n, fromX, fromY, maxDist) {
    var maxD2 = maxDist ? maxDist * maxDist : 0, out = [];
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i], dx = e.x - fromX, dy = e.y - fromY, d2 = dx * dx + dy * dy;
      if (maxD2 && d2 > maxD2) continue;
      if (out.length < n) { out.push({ e: e, d2: d2 }); out.sort(byD2); }
      else if (d2 < out[n - 1].d2) { out[n - 1] = { e: e, d2: d2 }; out.sort(byD2); }
    }
    var r = []; for (var j = 0; j < out.length; j++) r.push(out[j].e); return r;
  }
  function byD2(a, b) { return a.d2 - b.d2; }

  function rollDmg(base) { return Math.random() < P.crit ? { dmg: base * P.critMul, crit: true } : { dmg: base, crit: false }; }

  function hurtEnemy(e, dmg, kx, ky, crit) {
    e.hp -= dmg; e.flash = 0.12;
    if (kx || ky) { e.kx += kx; e.ky += ky; }
    spawnText(e.x, e.y - e.r, Math.round(dmg), crit ? "#ffd24a" : (e.boss ? "#ffe9a8" : "#ffffff"), crit ? 17 : (e.boss ? 18 : 13));
    if (e.hp <= 0) killEnemy(e);
  }
  function applySlow(e, f, dur) { if (!f || f >= 1) return; e.slowF = Math.min(e.slowF || 1, f); e.slowT = Math.max(e.slowT, dur || 0.5); }
  function applyStun(e, dur) { if (dur) e.stunT = Math.max(e.stunT || 0, dur); }

  function killEnemy(e) {
    var i = enemies.indexOf(e);
    if (i >= 0) { enemies[i] = enemies[enemies.length - 1]; enemies.pop(); }
    kills++;
    if (e.boss) { bossKills++; bossAlive = Math.max(0, bossAlive - 1); if (bossAlive === 0 && cb.onBossEnd) cb.onBossEnd(); }
    burst(e.x, e.y, e.color, e.boss ? 38 : 9, e.boss ? 4 : 2);
    var gemN = e.boss ? 12 : 1, tier = e.boss ? 2 : (e.xp >= 5 ? 1 : 0);
    for (var k = 0; k < gemN; k++) gems.push({ x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r), value: e.xp, tier: tier, vx: rand(-40, 40), vy: rand(-40, 40), att: false, t: 0 });
    if (e.boss) { drops.push(mkDrop(e.x, e.y, "heart")); drops.push(mkDrop(e.x + 20, e.y, "magnet")); addShake(6); }
    else { var r = Math.random() - P.luck * 0.01; if (r < 0.012) drops.push(mkDrop(e.x, e.y, "heart")); else if (r < 0.02) drops.push(mkDrop(e.x, e.y, "magnet")); }
  }
  function mkDrop(x, y, kind) { return { x: x, y: y, kind: kind, att: false, t: 0, bob: rand(0, TAU) }; }

  function damageArea(x, y, radius, dmg, kb, slowF, slowDur) {
    var r2 = radius * radius, hit = 0;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i], dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
      if (d2 <= r2) {
        var d = Math.sqrt(d2) || 1, rd = rollDmg(dmg);
        hurtEnemy(e, rd.dmg, kb ? dx / d * kb : 0, kb ? dy / d * kb : 0, rd.crit);
        if (slowF) applySlow(e, slowF, slowDur);
        hit++;
        if (enemies[i] !== e) i--;
      }
    }
    return hit;
  }

  // ============================================================
  //  weapon archetypes
  // ============================================================
  function eff(base, per, lv) { return (base || 0) + (per || 0) * (lv - 1); }
  function updateWeapons(dt) {
    for (var key in weapons) {
      var w = weapons[key], def = WEAPONS[key]; if (!def) continue;
      var fn = ARCH[def.archetype]; if (fn) fn(w, def, def.params || {}, dt);
    }
  }
  function timed(w, p, lv, dt) {
    w.cd -= dt; if (w.cd > 0) return false;
    w.cd = Math.max(p.intervalMin || 0.18, eff(p.interval, p.intervalPer, lv) * P.cdMul);
    return true;
  }

  var ARCH = {
    shot: function (w, def, p, dt) {
      if (!timed(w, p, w.level, dt)) return;
      var lv = w.level;
      var count = Math.round(eff(p.count, p.countPer, lv)) + P.amount;
      if (count < 1) count = 1;
      var dmg = eff(p.dmg, p.dmgPer, lv) * P.dmgMul;
      var pierce = Math.round(eff(p.pierce, p.piercePer, lv));
      var speed = (p.speed || 420) * P.projSpeedMul;
      var tg = nearest(count, P.x, P.y);
      for (var i = 0; i < count; i++) {
        var ang;
        if (tg[i]) ang = Math.atan2(tg[i].y - P.y, tg[i].x - P.x);
        else if (tg[0]) ang = Math.atan2(tg[0].y - P.y, tg[0].x - P.x) + rand(-0.4, 0.4);
        else ang = P.facing + (p.spread || 0.5) * (i - (count - 1) / 2);
        var rd = rollDmg(dmg);
        spawnShot({ x: P.x, y: P.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg: rd.dmg, crit: rd.crit, r: (p.projR || 8), pierce: pierce, life: 1.4, color: def.color, homing: p.homing || 0, slowF: p.slow || 0, slowDur: p.slowDur || 0 });
      }
    },
    orbit: function (w, def, p, dt) {
      var lv = w.level;
      var count = Math.max(1, Math.round(eff(p.count, p.countPer, lv)) + (P.amount ? 1 : 0));
      var radius = eff(p.radius, p.radiusPer, lv) * P.areaMul;
      w.orbA = (w.orbA + dt * (p.spin || 1.7)) % TAU;
      w.cd -= dt; var doHit = w.cd <= 0; if (doHit) w.cd = p.tickCd || 0.12;
      var dmg = eff(p.dmg, p.dmgPer, lv) * P.dmgMul, orbR = (p.orbR || 16) * P.areaMul;
      w._orbs = []; w._color = def.color;
      for (var i = 0; i < count; i++) {
        var a = w.orbA + (i / count) * TAU, ox = P.x + Math.cos(a) * radius, oy = P.y + Math.sin(a) * radius;
        w._orbs.push([ox, oy]);
        if (doHit) damageArea(ox, oy, orbR, dmg, 60);
      }
    },
    aura: function (w, def, p, dt) {
      w._radius = eff(p.radius, p.radiusPer, w.level) * P.areaMul; w._color = def.color;
      w.cd -= dt; if (w.cd > 0) return; w.cd = p.tick || 0.4;
      damageArea(P.x, P.y, w._radius, eff(p.dmg, p.dmgPer, w.level) * P.dmgMul, 30, p.slow || 0, p.slowDur || 0);
    },
    nova: function (w, def, p, dt) {
      if (!timed(w, p, w.level, dt)) return;
      var lv = w.level;
      novas.push({ x: P.x, y: P.y, r: 8, maxR: eff(p.maxR, p.maxRPer, lv) * P.areaMul, dmg: eff(p.dmg, p.dmgPer, lv) * P.dmgMul, speed: p.speed || 520, kb: p.kb || 120, hit: [], color: def.color,
        leavesZone: p.leavesZone, zoneDmg: (p.zoneDmg || 0) * P.dmgMul, zoneLife: (p.zoneLife || 0) * P.durationMul });
      addShake(3); if (global.SFX) SFX.lumNova();
    },
    chain: function (w, def, p, dt) {
      if (!timed(w, p, w.level, dt)) return;
      var lv = w.level, jumps = Math.round(eff(p.jumps, p.jumpsPer, lv)), dmg = eff(p.dmg, p.dmgPer, lv) * P.dmgMul;
      var range2 = (p.range || 220) * (p.range || 220), col = def.color;
      var first = nearest(1, P.x, P.y, 380)[0]; if (!first) return;
      var cur = first, fx = P.x, fy = P.y, used = [];
      for (var j = 0; j < jumps && cur; j++) {
        bolts.push({ x1: fx, y1: fy, x2: cur.x, y2: cur.y, life: 0.18, color: col });
        var rd = rollDmg(dmg); hurtEnemy(cur, rd.dmg, 0, 0, rd.crit); applyStun(cur, p.stunDur || 0);
        used.push(cur); fx = cur.x; fy = cur.y;
        var nxt = null, best = range2;
        for (var i = 0; i < enemies.length; i++) { var e = enemies[i]; if (used.indexOf(e) >= 0) continue; var dx = e.x - fx, dy = e.y - fy, d2 = dx * dx + dy * dy; if (d2 < best) { best = d2; nxt = e; } }
        cur = nxt;
      }
    },
    meteor: function (w, def, p, dt) {
      if (!timed(w, p, w.level, dt)) return;
      var lv = w.level, n = Math.max(1, Math.round(eff(p.count, p.countPer, lv)));
      var aoe = eff(p.aoe, p.aoePer, lv) * P.areaMul, dmg = eff(p.dmg, p.dmgPer, lv) * P.dmgMul;
      for (var i = 0; i < n; i++) {
        var tg = enemies.length ? pickOne(enemies) : null;
        var tx = tg ? tg.x + rand(-40, 40) : P.x + rand(-260, 260), ty = tg ? tg.y + rand(-40, 40) : P.y + rand(-260, 260);
        meteors.push({ x: tx, y: ty, fall: 0.85, aoe: aoe, dmg: dmg, color: def.color });
      }
    },
    whip: function (w, def, p, dt) {
      if (!timed(w, p, w.level, dt)) return;
      var lv = w.level, dmg = eff(p.dmg, p.dmgPer, lv) * P.dmgMul;
      var range = eff(p.range, p.rangePer, lv) * P.areaMul, arc = p.arc || 1.4;
      var dirs = [P.facing]; if (p.bothSides) dirs.push(P.facing + Math.PI);
      for (var di = 0; di < dirs.length; di++) {
        var dir = dirs[di];
        for (var i = 0; i < enemies.length; i++) {
          var e = enemies[i], dx = e.x - P.x, dy = e.y - P.y, d = hypot(dx, dy);
          if (d <= range + e.r && Math.abs(angDiff(Math.atan2(dy, dx), dir)) <= arc / 2) {
            var rd = rollDmg(dmg); hurtEnemy(e, rd.dmg, Math.cos(dir) * 90, Math.sin(dir) * 90, rd.crit);
            if (enemies[i] !== e) i--;
          }
        }
        arcs.push({ x: P.x, y: P.y, ang: dir, arc: arc, range: range, life: 0.2, color: def.color });
      }
    },
    zone: function (w, def, p, dt) {
      if (!timed(w, p, w.level, dt)) return;
      var lv = w.level, tx = P.x, ty = P.y;
      if (!p.follow) { var tg = nearest(1, P.x, P.y, 360)[0]; if (tg) { tx = tg.x; ty = tg.y; } else { tx = P.x + rand(-120, 120); ty = P.y + rand(-120, 120); } }
      zones.push({ x: tx, y: ty, r: eff(p.r, p.rPer, lv) * P.areaMul, dmg: eff(p.dmg, p.dmgPer, lv) * P.dmgMul,
        life: (p.life || 2) * P.durationMul, tick: p.tick || 0.4, cd: 0, pull: p.pull || 0, slowF: p.slow || 0, slowDur: p.slowDur || 0, color: def.color, follow: !!p.follow });
    },
    boomerang: function (w, def, p, dt) {
      if (!timed(w, p, w.level, dt)) return;
      var lv = w.level, count = Math.max(1, Math.round(eff(p.count, p.countPer, lv)) + P.amount);
      var dmg = eff(p.dmg, p.dmgPer, lv) * P.dmgMul, speed = (p.speed || 360) * P.projSpeedMul, range = (p.range || 240) * P.areaMul;
      var tg = nearest(count, P.x, P.y);
      for (var i = 0; i < count; i++) {
        var ang = tg[i] ? Math.atan2(tg[i].y - P.y, tg[i].x - P.x) : P.facing + (i - (count - 1) / 2) * 0.4;
        var rd = rollDmg(dmg);
        spawnShot({ x: P.x, y: P.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dmg: rd.dmg, crit: rd.crit, r: p.projR || 10, pierce: 99, life: 4, color: def.color, boomerang: true, range: range, traveled: 0, returning: false });
      }
    }
  };

  function spawnShot(o) {
    o.hitIds = []; if (o.pierce == null) o.pierce = 0; if (o.life == null) o.life = 1.3;
    shots.push(o);
  }

  // ============================================================
  //  update
  // ============================================================
  function update(dt) {
    elapsed += dt;
    var mx = move.x, my = move.y, ml = hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; ml = 1; }
    P.vx = mx * P.speed; P.vy = my * P.speed;
    P.x += P.vx * dt; P.y += P.vy * dt;
    if (ml > 0.05) P.facing = Math.atan2(my, mx);
    if (P.inv > 0) P.inv -= dt;
    if (P.regen) P.hp = Math.min(P.hpMax, P.hp + P.regen * dt);

    cam.x += (P.x - cam.x) * Math.min(1, dt * 8);
    cam.y += (P.y - cam.y) * Math.min(1, dt * 8);

    director(dt);
    updateWeapons(dt);

    // enemies
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i], dx = P.x - e.x, dy = P.y - e.y, d = hypot(dx, dy) || 1;
      e.wob += dt * 6;
      if (e.slowT > 0) e.slowT -= dt; var sf = e.slowT > 0 ? e.slowF : 1;
      if (e.stunT > 0) { e.stunT -= dt; sf = 0; }
      e.x += (dx / d) * e.speed * sf * dt + e.kx * dt;
      e.y += (dy / d) * e.speed * sf * dt + e.ky * dt;
      e.kx *= 0.86; e.ky *= 0.86;
      if (e.flash > 0) e.flash -= dt;
      if (d > spawnRing() * 2.2) { var a = Math.atan2(P.y - e.y, P.x - e.x) + rand(-1, 1); e.x = P.x + Math.cos(a) * spawnRing(); e.y = P.y + Math.sin(a) * spawnRing(); }
      if (d < e.r + 16 && P.inv <= 0) {
        var dmg = e.dmg * (1 - P.armor);
        P.hp -= dmg; P.inv = IFRAME; flash = Math.max(flash, 0.5); addShake(5);
        spawnText(P.x, P.y - 30, "-" + Math.round(dmg), "#ff5d7a", 15);
        if (global.SFX) SFX.lumHurt(); if (cb.onHurt) cb.onHurt();
        if (P.hp <= 0) { gameOver(); return; }
      }
    }

    // shots (with homing + boomerang)
    for (var s = shots.length - 1; s >= 0; s--) {
      var p = shots[s];
      if (p.homing) {
        var tg = nearest(1, p.x, p.y, 320)[0];
        if (tg) {
          var want = Math.atan2(tg.y - p.y, tg.x - p.x), cura = Math.atan2(p.vy, p.vx);
          var na = cura + clamp(angDiff(want, cura), -p.homing * dt, p.homing * dt);
          var sp2 = hypot(p.vx, p.vy); p.vx = Math.cos(na) * sp2; p.vy = Math.sin(na) * sp2;
        }
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      var dead = p.life <= 0;
      if (p.boomerang) {
        p.traveled += hypot(p.vx, p.vy) * dt;
        if (!p.returning && p.traveled >= p.range) { p.returning = true; p.hitIds = []; }
        if (p.returning) {
          var ba = Math.atan2(P.y - p.y, P.x - p.x), bs = hypot(p.vx, p.vy);
          p.vx = Math.cos(ba) * bs; p.vy = Math.sin(ba) * bs;
          if (hypot(P.x - p.x, P.y - p.y) < 24) dead = true;
        }
      }
      if (!dead) {
        for (var j = 0; j < enemies.length; j++) {
          var en = enemies[j]; if (p.hitIds.indexOf(en) >= 0) continue;
          var ex = en.x - p.x, ey = en.y - p.y;
          if (ex * ex + ey * ey < (en.r + p.r) * (en.r + p.r)) {
            hurtEnemy(en, p.dmg, p.vx * 0.06, p.vy * 0.06, p.crit);
            if (p.slowF) applySlow(en, p.slowF, p.slowDur);
            p.hitIds.push(en);
            if (!p.boomerang && p.pierce-- <= 0) { dead = true; break; }
          }
        }
      }
      if (dead) { shots[s] = shots[shots.length - 1]; shots.pop(); }
    }

    // novas
    for (var nv = novas.length - 1; nv >= 0; nv--) {
      var no = novas[nv]; no.r += dt * no.speed;
      for (var q = 0; q < enemies.length; q++) {
        var ne = enemies[q]; if (no.hit.indexOf(ne) >= 0) continue;
        var ddx = ne.x - no.x, ddy = ne.y - no.y, dd = hypot(ddx, ddy);
        if (dd <= no.r && dd >= no.r - 28) { var rd = rollDmg(no.dmg); hurtEnemy(ne, rd.dmg, ddx / (dd || 1) * no.kb, ddy / (dd || 1) * no.kb, rd.crit); no.hit.push(ne); if (enemies[q] !== ne) q--; }
      }
      if (no.r >= no.maxR) {
        if (no.leavesZone) zones.push({ x: no.x, y: no.y, r: no.maxR * 0.7, dmg: no.zoneDmg, life: no.zoneLife, tick: 0.3, cd: 0, pull: 0, slowF: 0, slowDur: 0, color: no.color, follow: false });
        novas[nv] = novas[novas.length - 1]; novas.pop();
      }
    }

    // zones (lingering fields)
    for (var z = zones.length - 1; z >= 0; z--) {
      var zo = zones[z]; zo.life -= dt; if (zo.follow) { zo.x = P.x; zo.y = P.y; }
      if (zo.pull) {
        for (var pz = 0; pz < enemies.length; pz++) { var pe = enemies[pz], pdx = zo.x - pe.x, pdy = zo.y - pe.y, pd = hypot(pdx, pdy); if (pd < zo.r && pd > 6) { pe.x += pdx / pd * zo.pull * dt; pe.y += pdy / pd * zo.pull * dt; } }
      }
      zo.cd -= dt;
      if (zo.cd <= 0) { zo.cd = zo.tick; damageArea(zo.x, zo.y, zo.r, zo.dmg, 0, zo.slowF, zo.slowDur); }
      if (zo.life <= 0) { zones[z] = zones[zones.length - 1]; zones.pop(); }
    }

    // meteors
    for (var mt = meteors.length - 1; mt >= 0; mt--) {
      var mo = meteors[mt]; mo.fall -= dt;
      if (mo.fall <= 0) { damageArea(mo.x, mo.y, mo.aoe, mo.dmg, 140); burst(mo.x, mo.y, mo.color, 18, 3); addShake(4); meteors[mt] = meteors[meteors.length - 1]; meteors.pop(); }
    }

    // lightning + arcs fade
    for (var b = bolts.length - 1; b >= 0; b--) { bolts[b].life -= dt; if (bolts[b].life <= 0) { bolts[b] = bolts[bolts.length - 1]; bolts.pop(); } }
    for (var ar = arcs.length - 1; ar >= 0; ar--) { arcs[ar].life -= dt; if (arcs[ar].life <= 0) { arcs[ar] = arcs[arcs.length - 1]; arcs.pop(); } }

    // gems
    for (var g = gems.length - 1; g >= 0; g--) {
      var gm = gems[g]; gm.t += dt;
      var gdx = P.x - gm.x, gdy = P.y - gm.y, gd = hypot(gdx, gdy);
      if (gm.att || gd < P.magnet) { gm.att = true; var spd = 260 + (P.magnet - gd) * 3; gm.x += gdx / (gd || 1) * spd * dt; gm.y += gdy / (gd || 1) * spd * dt; }
      else { gm.x += gm.vx * dt; gm.y += gm.vy * dt; gm.vx *= 0.9; gm.vy *= 0.9; }
      if (gd < 16) { xp += gm.value * P.xpMul; gems[g] = gems[gems.length - 1]; gems.pop(); if (global.SFX && gm.t > 0.05) SFX.lumPick(); }
    }

    // drops
    for (var d2 = drops.length - 1; d2 >= 0; d2--) {
      var dr = drops[d2]; dr.t += dt; dr.bob += dt * 3;
      var ddx2 = P.x - dr.x, ddy2 = P.y - dr.y, dd2 = hypot(ddx2, ddy2);
      if (dd2 < P.magnet) { dr.x += ddx2 / (dd2 || 1) * 300 * dt; dr.y += ddy2 / (dd2 || 1) * 300 * dt; }
      if (dd2 < 18) {
        if (dr.kind === "heart") { P.hp = Math.min(P.hpMax, P.hp + P.hpMax * 0.25); spawnText(P.x, P.y - 30, "+HP", "#ff7da6", 15); if (global.SFX) SFX.life(); }
        else { for (var zz = 0; zz < gems.length; zz++) gems[zz].att = true; spawnText(P.x, P.y - 30, "MAGNET", "#38e1c9", 14); if (global.SFX) SFX.powerup(); }
        drops[d2] = drops[drops.length - 1]; drops.pop();
      }
    }

    for (var pa = parts.length - 1; pa >= 0; pa--) { var pt = parts[pa]; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.92; pt.vy *= 0.92; pt.life -= dt; if (pt.life <= 0) { parts[pa] = parts[parts.length - 1]; parts.pop(); } }
    for (var tx = texts.length - 1; tx >= 0; tx--) { var tt = texts[tx]; tt.y += tt.vy * dt; tt.vy *= 0.92; tt.life -= dt; if (tt.life <= 0) { texts[tx] = texts[texts.length - 1]; texts.pop(); } }

    if (flash > 0) flash = Math.max(0, flash - dt * 2.2);
    if (shake.t > 0) shake.t -= dt; else shake.mag = 0;

    while (xp >= xpNext) { xp -= xpNext; level++; xpNext = xpFor(level); pendingLevels++; }
    emitStats();
    if (pendingLevels > 0) triggerLevelUp();
  }

  // ============================================================
  //  level up + evolution
  // ============================================================
  function evolveReady(wkey) {
    var def = WEAPONS[wkey]; if (!def || !def.evolvesTo || !def.evolveWith) return false;
    if (weapons[def.evolvesTo]) return false;
    var pd = PASSIVES[def.evolveWith]; if (!pd) return false;
    return weapons[wkey].level >= (def.maxLevel || WEAPON_MAX_LV) && (P.passives[def.evolveWith] || 0) >= (pd.maxLevel || PASSIVE_MAX_LV);
  }

  function rollChoices() {
    var out = [], k;
    // evolutions first (high priority golden picks)
    for (k in weapons) if (evolveReady(k)) {
      var d = WEAPONS[k], ed = WEAPONS[d.evolvesTo];
      out.push({ id: "evo:" + k, icon: ed.icon || "✨", name: ed.name, desc: "進化: " + d.name + " → " + ed.name, sub: "進化", isEvolve: true });
    }
    var pool = [];
    var owned = Object.keys(weapons).length;
    for (k in weapons) { var wd = WEAPONS[k]; if (wd && weapons[k].level < (wd.maxLevel || WEAPON_MAX_LV)) pool.push({ id: "w:" + k, kind: "weapon", key: k, level: weapons[k].level }); }
    if (owned < MAX_WEAPONS) { var pk = pickableWeaponKeys(); for (var i = 0; i < pk.length; i++) if (!weapons[pk[i]]) pool.push({ id: "w:" + pk[i], kind: "weapon", key: pk[i], level: 0, isNew: true }); }
    var pks = passiveKeys();
    for (var pi = 0; pi < pks.length; pi++) { var key = pks[pi], lv = P.passives[key] || 0, mx = PASSIVES[key].maxLevel || PASSIVE_MAX_LV; if (lv < mx) pool.push({ id: "p:" + key, kind: "passive", key: key, level: lv, isNew: lv === 0 }); }
    for (var s = pool.length - 1; s > 0; s--) { var r = (Math.random() * (s + 1)) | 0; var tmp = pool[s]; pool[s] = pool[r]; pool[r] = tmp; }
    var need = 3 - out.length;
    for (var n = 0; n < pool.length && n < need; n++) {
      var c = pool[n], meta = c.kind === "weapon" ? WEAPONS[c.key] : PASSIVES[c.key];
      out.push({ id: c.id, icon: meta.icon, name: meta.name, desc: meta.desc, sub: c.isNew ? "NEW" : "Lv " + (c.level + 1), isNew: !!c.isNew });
    }
    if (!out.length) out.push({ id: "heal", icon: "❤", name: "癒やしの光", desc: "HPを40%回復", sub: "" });
    return out;
  }

  function triggerLevelUp() {
    phase = "levelup"; cancelAnimationFrame(rafId);
    if (global.SFX) SFX.lumLevel();
    cb.onLevelUp && cb.onLevelUp(rollChoices(), applyChoice);
  }
  function applyChoice(id) {
    if (id === "heal") { P.hp = Math.min(P.hpMax, P.hp + P.hpMax * 0.4); }
    else if (id.slice(0, 4) === "evo:") {
      var base = id.slice(4), d = WEAPONS[base];
      if (d && d.evolvesTo) { delete weapons[base]; addWeapon(d.evolvesTo); flash = Math.max(flash, 0.5); addShake(6); }
    } else {
      var kind = id.slice(0, 1), key = id.slice(2);
      if (kind === "w") { if (weapons[key]) weapons[key].level++; else addWeapon(key); }
      else { P.passives[key] = (P.passives[key] || 0) + 1; recompute(); }
    }
    pendingLevels--;
    emitWeapons(); emitStats();
    if (pendingLevels > 0) { cb.onLevelUp && cb.onLevelUp(rollChoices(), applyChoice); return; }
    phase = "play"; lastT = 0; rafId = requestAnimationFrame(frame);
  }

  // ---------- effects ----------
  function burst(x, y, color, n, scale) {
    scale = scale || 2;
    for (var i = 0; i < n; i++) { var a = rand(0, TAU), sp2 = rand(40, 200) * scale * 0.5; parts.push({ x: x, y: y, vx: Math.cos(a) * sp2, vy: Math.sin(a) * sp2, life: rand(0.3, 0.7), maxLife: 0.7, color: color, r: rand(1.5, 3.5) * scale }); }
  }
  function spawnText(x, y, txt, color, size) { texts.push({ x: x, y: y, txt: "" + txt, color: color, size: size || 13, vy: -34, life: 0.8 }); }
  function addShake(m) { shake.mag = Math.max(shake.mag, m); shake.t = 0.28; }

  // ---------- callbacks ----------
  function emitStats() { cb.onStats && cb.onStats({ hp: Math.max(0, P.hp), hpMax: P.hpMax, time: Math.floor(elapsed), level: level, xp: xp, xpNext: xpNext, kills: kills, cleared: cleared }); }
  function emitWeapons() { if (!cb.onWeapons) return; var list = []; for (var k in weapons) { var d = WEAPONS[k]; if (d) list.push({ icon: d.icon, name: d.name, level: weapons[k].level, evolved: !!d.hidden }); } cb.onWeapons(list); }
  function gameOver() {
    running = false; phase = "dead"; cancelAnimationFrame(rafId);
    burst(P.x, P.y, "#9bffe9", 50, 4); addShake(10);
    if (global.SFX) SFX.death();
    cb.onGameOver && cb.onGameOver({ time: Math.floor(elapsed), level: level, kills: kills, bosses: bossKills, stage: curStage.key, character: curChar.key, cleared: cleared });
  }

  // ============================================================
  //  rendering
  // ============================================================
  function render() {
    var sx = 0, sy = 0;
    if (shake.t > 0) { sx = rand(-shake.mag, shake.mag); sy = rand(-shake.mag, shake.mag); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = bgGrad || "#05060f"; ctx.fillRect(0, 0, cw, ch);
    drawMotes();
    ctx.save();
    ctx.translate(cw / 2 - cam.x + sx, ch / 2 - cam.y + sy);
    drawGrid(); drawWorld();
    ctx.restore();
    drawVignette();
    if (flash > 0) { ctx.fillStyle = "rgba(255,40,70," + (flash * 0.4) + ")"; ctx.fillRect(0, 0, cw, ch); }
    drawJoystick();
  }

  function drawGrid() {
    var G = 150;
    var x0 = Math.floor((cam.x - cw) / G) * G, x1 = cam.x + cw, y0 = Math.floor((cam.y - ch) / G) * G, y1 = cam.y + ch;
    ctx.strokeStyle = (stageBg && stageBg.grid) || "rgba(90,120,220,0.06)"; ctx.lineWidth = 1; ctx.beginPath();
    for (var x = x0; x <= x1; x += G) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (var y = y0; y <= y1; y += G) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();
  }

  function spr(s, x, y, size) { if (s) ctx.drawImage(s, x - size / 2, y - size / 2, size, size); else { ctx.beginPath(); ctx.arc(x, y, size / 3, 0, TAU); ctx.fill(); } }

  function drawWorld() {
    var i, w, k;
    ctx.globalCompositeOperation = "lighter";
    for (i = 0; i < gems.length; i++) { var gm = gems[i]; var gs = gm.tier === 2 ? sprites.gem2 : (gm.tier === 1 ? sprites.gem1 : sprites.gem0); spr(gs, gm.x, gm.y, 22 * (1 + Math.sin(gm.t * 6) * 0.12)); }
    ctx.globalCompositeOperation = "source-over";
    for (i = 0; i < drops.length; i++) { var dr = drops[i]; spr(dr.kind === "heart" ? sprites.heart : sprites.magnet, dr.x, dr.y + Math.sin(dr.bob) * 3, 30); }

    // enemies
    for (i = 0; i < enemies.length; i++) {
      var e = enemies[i], size = e.r * 2.6 + Math.sin(e.wob) * 2;
      spr(spriteFor(e.spr), e.x, e.y, size);
      if (e.flash > 0) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = e.flash * 4; spr(spriteFor(e.spr), e.x, e.y, size); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; }
      if (e.boss) drawHpBar(e);
    }

    ctx.globalCompositeOperation = "lighter";
    // zones
    for (i = 0; i < zones.length; i++) {
      var zo = zones[i], za = clamp(zo.life, 0, 1) * 0.5;
      var zg = ctx.createRadialGradient(zo.x, zo.y, zo.r * 0.2, zo.x, zo.y, zo.r);
      zg.addColorStop(0, hexA(zo.color, za * 0.5)); zg.addColorStop(0.7, hexA(zo.color, za * 0.25)); zg.addColorStop(1, hexA(zo.color, 0));
      ctx.fillStyle = zg; ctx.beginPath(); ctx.arc(zo.x, zo.y, zo.r, 0, TAU); ctx.fill();
    }
    // auras (weapons exposing _radius)
    for (k in weapons) { w = weapons[k]; if (w._radius) {
      var ar = w._radius, ag = ctx.createRadialGradient(P.x, P.y, ar * 0.4, P.x, P.y, ar);
      ag.addColorStop(0, hexA(w._color, 0)); ag.addColorStop(0.8, hexA(w._color, 0.12)); ag.addColorStop(1, hexA(w._color, 0.28));
      ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(P.x, P.y, ar, 0, TAU); ctx.fill();
    } }
    // novas
    for (i = 0; i < novas.length; i++) { var no = novas[i], a = 1 - no.r / no.maxR; ctx.strokeStyle = hexA(no.color, a * 0.85); ctx.lineWidth = 6 * a + 2; ctx.beginPath(); ctx.arc(no.x, no.y, no.r, 0, TAU); ctx.stroke(); }
    // orbs (weapons exposing _orbs)
    for (k in weapons) { w = weapons[k]; if (w._orbs) for (i = 0; i < w._orbs.length; i++) { var o = w._orbs[i]; spr(tintGlow(w._color), o[0], o[1], 30); } }
    // shots
    for (i = 0; i < shots.length; i++) { var p = shots[i]; spr(tintGlow(p.color), p.x, p.y, (p.r || 8) * 2.6); }
    // whip arcs
    for (i = 0; i < arcs.length; i++) {
      var aw = arcs[i], aa = clamp(aw.life / 0.2, 0, 1);
      ctx.strokeStyle = hexA(aw.color, aa * 0.85); ctx.lineWidth = 8 * aa + 2;
      ctx.beginPath(); ctx.arc(aw.x, aw.y, aw.range * 0.8, aw.ang - aw.arc / 2, aw.ang + aw.arc / 2); ctx.stroke();
    }
    // lightning
    for (i = 0; i < bolts.length; i++) { var bl = bolts[i]; ctx.strokeStyle = hexA(bl.color || "#b8dcff", bl.life * 5); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bl.x1, bl.y1); ctx.lineTo((bl.x1 + bl.x2) / 2 + rand(-12, 12), (bl.y1 + bl.y2) / 2 + rand(-12, 12)); ctx.lineTo(bl.x2, bl.y2); ctx.stroke(); }
    // meteors
    for (i = 0; i < meteors.length; i++) {
      var mo = meteors[i], fp = 1 - mo.fall / 0.85;
      ctx.strokeStyle = hexA(mo.color, 0.6); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mo.x, mo.y, mo.aoe * (0.4 + fp * 0.6), 0, TAU); ctx.stroke();
      var streak = (1 - fp) * 300; ctx.strokeStyle = hexA(mo.color, 0.9); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(mo.x + streak, mo.y - streak); ctx.lineTo(mo.x + streak * 0.5, mo.y - streak * 0.5); ctx.stroke();
    }
    // particles
    for (i = 0; i < parts.length; i++) { var pt = parts[i]; ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1); ctx.fillStyle = pt.color; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";

    // player
    var invBlink = P.inv > 0 && (((P.inv * 20) | 0) % 2 === 0);
    if (!invBlink) { ctx.globalCompositeOperation = "lighter"; spr(sprites.player, P.x, P.y, 56 * (1 + Math.sin(elapsed * 5) * 0.06)); ctx.globalCompositeOperation = "source-over"; }

    // texts
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (i = 0; i < texts.length; i++) { var tt = texts[i]; ctx.globalAlpha = clamp(tt.life / 0.8, 0, 1); ctx.fillStyle = tt.color; ctx.font = "900 " + tt.size + "px system-ui, sans-serif"; ctx.fillText(tt.txt, tt.x, tt.y); }
    ctx.globalAlpha = 1;
  }

  function drawHpBar(e) { var w = e.r * 2.4, h = 5, x = e.x - w / 2, y = e.y - e.r - 16; ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x, y, w, h); ctx.fillStyle = "#ffd24a"; ctx.fillRect(x, y, w * clamp(e.hp / e.hpMax, 0, 1), h); }

  function drawMotes() {
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i]; m.x += m.vx; m.y += m.vy;
      if (m.x < -10) m.x = cw + 10; else if (m.x > cw + 10) m.x = -10;
      if (m.y < -10) m.y = ch + 10; else if (m.y > ch + 10) m.y = -10;
      ctx.globalAlpha = m.a; ctx.fillStyle = m.c; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
  function drawVignette() { if (vignette) { ctx.fillStyle = vignette; ctx.fillRect(0, 0, cw, ch); } }

  // ---------- input ----------
  var joy = { active: false, bx: 0, by: 0, nx: 0, ny: 0 }, keys = {};
  function keyVec() { move.x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0); move.y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0); }
  function onKey(e, down) {
    var c = e.code;
    if (c === "ArrowLeft" || c === "KeyA") keys.left = down;
    else if (c === "ArrowRight" || c === "KeyD") keys.right = down;
    else if (c === "ArrowUp" || c === "KeyW") keys.up = down;
    else if (c === "ArrowDown" || c === "KeyS") keys.down = down;
    else return;
    e.preventDefault(); keyVec();
  }
  function ptXY(ev) { var r = canvas.getBoundingClientRect(), t = ev.touches ? ev.touches[0] : ev; return { x: t.clientX - r.left, y: t.clientY - r.top }; }
  function onDown(e) { if (e.cancelable) e.preventDefault(); var p = ptXY(e); joy.active = true; joy.bx = p.x; joy.by = p.y; joy.nx = 0; joy.ny = 0; }
  function onMove(e) { if (!joy.active) return; if (e.cancelable) e.preventDefault(); var p = ptXY(e), dx = p.x - joy.bx, dy = p.y - joy.by, d = hypot(dx, dy), max = 56; if (d > max) { dx = dx / d * max; dy = dy / d * max; } joy.nx = dx / max; joy.ny = dy / max; move.x = joy.nx; move.y = joy.ny; }
  function onUp() { joy.active = false; joy.nx = joy.ny = 0; if (!keys.left && !keys.right && !keys.up && !keys.down) { move.x = 0; move.y = 0; } }
  function drawJoystick() {
    if (!joy.active) return;
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(56,225,201,0.4)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(joy.bx, joy.by, 56, 0, TAU); ctx.stroke();
    ctx.fillStyle = "rgba(155,255,233,0.5)"; ctx.beginPath(); ctx.arc(joy.bx + joy.nx * 56, joy.by + joy.ny * 56, 22, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
  var bound = false;
  function bindInput() {
    canvas.addEventListener("touchstart", onDown, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onUp); canvas.addEventListener("touchcancel", onUp);
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", function (e) { onKey(e, true); });
    window.addEventListener("keyup", function (e) { onKey(e, false); });
  }

  // ---------- resize / backdrop ----------
  function resize() {
    dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    cw = canvas.clientWidth || 360; ch = canvas.clientHeight || 720;
    canvas.width = Math.floor(cw * dpr); canvas.height = Math.floor(ch * dpr);
    MAX_ENEMIES = Math.min(220, Math.max(90, Math.floor(cw * ch / 2600)));
    rebuildBackdrop();
  }
  function rebuildBackdrop() {
    var bg = stageBg || { top: "#0a0a18", mid: "#070611", bot: "#03020a", moteHot: "rgba(108,140,255,0.9)", moteCool: "rgba(155,255,233,0.7)", vignette: "rgba(0,0,8,0.78)" };
    try {
      var g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, bg.top); g.addColorStop(0.6, bg.mid); g.addColorStop(1, bg.bot); bgGrad = g;
      var v = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, bg.vignette || "rgba(0,0,8,0.78)"); vignette = v;
    } catch (e) { bgGrad = bg.bot || "#05060f"; vignette = null; }
    motes = [];
    var n = Math.floor(cw * ch / 16000);
    for (var i = 0; i < n; i++) {
      var hot = Math.random() < 0.3;
      motes.push({ x: rand(0, cw), y: rand(0, ch), vx: rand(-0.15, 0.15), vy: rand(-0.25, -0.05), r: rand(0.6, hot ? 2.2 : 1.4), a: rand(0.05, 0.3), c: hot ? (bg.moteHot || "rgba(108,140,255,0.9)") : (bg.moteCool || "rgba(155,255,233,0.7)") });
    }
  }

  function frame(ts) {
    if (!running || phase !== "play") return;
    var dt = lastT ? (ts - lastT) / 1000 : 0; lastT = ts; dt = clamp(dt, 0, 0.05);
    update(dt);
    if (phase === "play") { render(); rafId = requestAnimationFrame(frame); }
  }

  // ============================================================
  //  public API
  // ============================================================
  function publicChar(c) { return { key: c.key, name: c.name, title: c.title, desc: c.desc, color: c.color, icon: c.icon, startWeapon: c.startWeapon, unlock: c.unlock || { type: "default" }, unlockHint: c.unlockHint || "" }; }
  function publicStage(s) { return { key: s.key, name: s.name, desc: s.desc, icon: s.icon, theme: s.theme, durationGoal: s.durationGoal, unlock: s.unlock || { type: "default" }, unlockHint: s.unlockHint || "" }; }

  var LuminaGame = {
    start: function (cnv, opts) {
      cb = opts || {};
      canvas = cnv; ctx = canvas.getContext("2d");
      resolveRegistries(); buildSprites();
      keys = {}; move.x = move.y = 0; joy.active = false;
      resize();
      window.addEventListener("resize", resize);
      if (!bound) { bindInput(); bound = true; }
      initWorld(cb.character, cb.stage);
      phase = "play"; running = true; lastT = 0;
      rafId = requestAnimationFrame(frame);
    },
    getCharacters: function () { resolveRegistries(); return CHARACTERS.map(publicChar); },
    getStages: function () { resolveRegistries(); return STAGES.map(publicStage); },
    setMove: function (x, y) { move.x = x; move.y = y; },
    pause: function () { if (phase === "play") { phase = "paused"; cancelAnimationFrame(rafId); } },
    resume: function () { if (phase === "paused") { phase = "play"; lastT = 0; rafId = requestAnimationFrame(frame); } },
    isPlaying: function () { return running; },
    isPaused: function () { return phase === "paused" || phase === "levelup"; },
    stop: function () { running = false; phase = "idle"; cancelAnimationFrame(rafId); window.removeEventListener("resize", resize); },
    // headless-test seam (not referenced by the app); lets tests reach the
    // weapon/passive state needed to exercise the evolution flow deterministically.
    _test: {
      forceEvolveReady: function (wkey) {
        var def = WEAPONS[wkey]; if (!def) return false;
        if (!weapons[wkey]) addWeapon(wkey);
        weapons[wkey].level = def.maxLevel || WEAPON_MAX_LV;
        if (def.evolveWith && PASSIVES[def.evolveWith]) { P.passives[def.evolveWith] = PASSIVES[def.evolveWith].maxLevel || PASSIVE_MAX_LV; recompute(); }
        return evolveReady(wkey);
      },
      rollChoices: function () { return rollChoices(); },
      applyChoice: function (id) { pendingLevels = Math.max(1, pendingLevels); applyChoice(id); },
      hasWeapon: function (k) { return !!(weapons && weapons[k]); },
      level: function () { return level; }
    }
  };
  global.LuminaGame = LuminaGame;
})(window);
