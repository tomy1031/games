(function (global) {
  "use strict";

  // ============================================================
  // ENEMIES — window.LUMINA_ENEMIES
  // spr in: shade, wisp, mite, brute, ghast, golem, boss, boss2, boss3
  // ============================================================
  var ENEMIES = [
    // --- Normal roster ---
    { key: "shade",  hp: 8,   speed: 48,  dmg: 7,  r: 14, xp: 1,  color: "#b070ff", spr: "shade", boss: false },
    { key: "wisp",   hp: 5,   speed: 96,  dmg: 5,  r: 11, xp: 1,  color: "#ff6cd8", spr: "wisp",  boss: false },
    { key: "mite",   hp: 3,   speed: 70,  dmg: 3,  r: 9,  xp: 1,  color: "#38e1c9", spr: "mite",  boss: false },
    { key: "swarm",  hp: 4,   speed: 110, dmg: 4,  r: 10, xp: 1,  color: "#9bffb0", spr: "wisp",  boss: false },
    { key: "ghast",  hp: 16,  speed: 60,  dmg: 9,  r: 15, xp: 2,  color: "#9bffb0", spr: "ghast", boss: false },
    { key: "brute",  hp: 52,  speed: 34,  dmg: 14, r: 20, xp: 4,  color: "#6c8cff", spr: "brute", boss: false },
    { key: "golem",  hp: 120, speed: 24,  dmg: 20, r: 26, xp: 8,  color: "#ffb04a", spr: "golem", boss: false },
    { key: "revnt",  hp: 38,  speed: 78,  dmg: 12, r: 16, xp: 5,  color: "#ff6cd8", spr: "ghast", boss: false },

    // --- Bosses (one per stage) ---
    { key: "boss1",  hp: 280, speed: 40,  dmg: 18, r: 42, xp: 60,  color: "#ffd24a", spr: "boss",  boss: true },
    { key: "boss2",  hp: 320, speed: 42,  dmg: 20, r: 44, xp: 72,  color: "#9bffb0", spr: "boss3", boss: true },
    { key: "boss3",  hp: 360, speed: 44,  dmg: 22, r: 46, xp: 84,  color: "#38e1c9", spr: "boss3", boss: true },
    { key: "boss4",  hp: 400, speed: 44,  dmg: 24, r: 48, xp: 96,  color: "#ffb04a", spr: "boss2", boss: true },
    { key: "boss5",  hp: 420, speed: 46,  dmg: 26, r: 50, xp: 108, color: "#ff5a5a", spr: "boss2", boss: true },
    { key: "boss6",  hp: 900, speed: 48,  dmg: 26, r: 52, xp: 120, color: "#ffd24a", spr: "boss",  boss: true }
  ];

  // ============================================================
  // STAGES — window.LUMINA_STAGES (exactly 6)
  // ============================================================
  var STAGES = [
    {
      key: "stage1",
      name: "黄昏の草原",
      desc: "茜さす草の海に、最初の影が湧き出す。",
      icon: "🌾",
      theme: "stage1",
      durationGoal: 300,
      bg: {
        top: "#16241c",
        mid: "#0e1a16",
        bot: "#070f0c",
        grid: "rgba(120,220,170,0.06)",
        moteHot: "rgba(255,210,74,0.35)",
        moteCool: "rgba(120,220,170,0.30)",
        vignette: "rgba(2,8,5,0.72)"
      },
      spawn: { rateMul: 1.0, hpMul: 1.0, dmgMul: 1.0, batchMul: 1.0 },
      roster: [
        { type: "shade", from: 0,   weight: 6 },
        { type: "wisp",  from: 20,  weight: 4 },
        { type: "mite",  from: 45,  weight: 3 },
        { type: "ghast", from: 120, weight: 2 }
      ],
      boss: "boss1",
      unlock: { type: "default" },
      unlockHint: "最初から挑戦できる。"
    },
    {
      key: "stage2",
      name: "常闇の樹海",
      desc: "光を呑む樹々の奥、ざわめく群れが牙を剥く。",
      icon: "🌲",
      theme: "stage2",
      durationGoal: 360,
      bg: {
        top: "#1a1230",
        mid: "#120c22",
        bot: "#080514",
        grid: "rgba(176,112,255,0.07)",
        moteHot: "rgba(255,108,216,0.30)",
        moteCool: "rgba(176,112,255,0.32)",
        vignette: "rgba(4,2,12,0.76)"
      },
      spawn: { rateMul: 1.1, hpMul: 1.2, dmgMul: 1.1, batchMul: 1.1 },
      roster: [
        { type: "shade", from: 0,   weight: 5 },
        { type: "wisp",  from: 0,   weight: 4 },
        { type: "mite",  from: 15,  weight: 4 },
        { type: "swarm", from: 60,  weight: 3 },
        { type: "ghast", from: 90,  weight: 2 },
        { type: "brute", from: 150, weight: 1 }
      ],
      boss: "boss2",
      unlock: { type: "clear", stage: "stage1" },
      unlockHint: "「黄昏の草原」をクリアで解放。"
    },
    {
      key: "stage3",
      name: "凍てつく霊峰",
      desc: "氷霧の尾根、青き亡霊が静かに迫る。",
      icon: "🏔️",
      theme: "stage3",
      durationGoal: 420,
      bg: {
        top: "#0e2436",
        mid: "#0a1726",
        bot: "#050d16",
        grid: "rgba(108,140,255,0.08)",
        moteHot: "rgba(56,225,201,0.30)",
        moteCool: "rgba(108,140,255,0.34)",
        vignette: "rgba(2,6,12,0.78)"
      },
      spawn: { rateMul: 1.2, hpMul: 1.4, dmgMul: 1.2, batchMul: 1.2 },
      roster: [
        { type: "wisp",  from: 0,   weight: 4 },
        { type: "shade", from: 0,   weight: 4 },
        { type: "swarm", from: 20,  weight: 4 },
        { type: "ghast", from: 45,  weight: 3 },
        { type: "brute", from: 90,  weight: 2 },
        { type: "revnt", from: 140, weight: 2 },
        { type: "golem", from: 210, weight: 1 }
      ],
      boss: "boss3",
      unlock: { type: "clear", stage: "stage2" },
      unlockHint: "「常闇の樹海」をクリアで解放。"
    },
    {
      key: "stage4",
      name: "灰の都",
      desc: "燻る瓦礫の街、火の粉とともに鋼が押し寄せる。",
      icon: "🏚️",
      theme: "stage4",
      durationGoal: 480,
      bg: {
        top: "#2a1c12",
        mid: "#1c1209",
        bot: "#0f0805",
        grid: "rgba(255,176,74,0.08)",
        moteHot: "rgba(255,140,40,0.36)",
        moteCool: "rgba(180,120,90,0.28)",
        vignette: "rgba(10,5,2,0.80)"
      },
      spawn: { rateMul: 1.35, hpMul: 1.6, dmgMul: 1.3, batchMul: 1.3 },
      roster: [
        { type: "shade", from: 0,   weight: 3 },
        { type: "ghast", from: 0,   weight: 4 },
        { type: "swarm", from: 0,   weight: 3 },
        { type: "brute", from: 40,  weight: 3 },
        { type: "revnt", from: 80,  weight: 3 },
        { type: "golem", from: 150, weight: 2 }
      ],
      boss: "boss4",
      unlock: { type: "clear", stage: "stage3" },
      unlockHint: "「凍てつく霊峰」をクリアで解放。"
    },
    {
      key: "stage5",
      name: "血染めの月",
      desc: "紅の月が昇り、狂宴の群れが渦を巻く。",
      icon: "🌑",
      theme: "stage5",
      durationGoal: 540,
      bg: {
        top: "#2e0e14",
        mid: "#1e070d",
        bot: "#100306",
        grid: "rgba(255,90,90,0.09)",
        moteHot: "rgba(255,60,80,0.38)",
        moteCool: "rgba(255,108,216,0.26)",
        vignette: "rgba(12,2,4,0.82)"
      },
      spawn: { rateMul: 1.5, hpMul: 1.9, dmgMul: 1.45, batchMul: 1.45 },
      roster: [
        { type: "wisp",  from: 0,   weight: 4 },
        { type: "ghast", from: 0,   weight: 4 },
        { type: "revnt", from: 0,   weight: 4 },
        { type: "brute", from: 30,  weight: 3 },
        { type: "swarm", from: 30,  weight: 3 },
        { type: "golem", from: 110, weight: 3 }
      ],
      boss: "boss5",
      unlock: { type: "clear", stage: "stage4" },
      unlockHint: "「灰の都」をクリアで解放。"
    },
    {
      key: "stage6",
      name: "夜明け前",
      desc: "藍より昇る金の兆し。常闇の主が立ちはだかる。",
      icon: "🌅",
      theme: "stage6",
      durationGoal: 600,
      bg: {
        top: "#141a3a",
        mid: "#0d1028",
        bot: "#070818",
        grid: "rgba(255,210,74,0.08)",
        moteHot: "rgba(255,210,74,0.40)",
        moteCool: "rgba(108,140,255,0.30)",
        vignette: "rgba(3,4,14,0.84)"
      },
      spawn: { rateMul: 1.6, hpMul: 2.2, dmgMul: 1.6, batchMul: 1.6 },
      roster: [
        { type: "ghast", from: 0,   weight: 4 },
        { type: "revnt", from: 0,   weight: 4 },
        { type: "brute", from: 0,   weight: 3 },
        { type: "swarm", from: 0,   weight: 3 },
        { type: "wisp",  from: 0,   weight: 3 },
        { type: "golem", from: 60,  weight: 3 }
      ],
      boss: "boss6",
      unlock: { type: "clear", stage: "stage5" },
      unlockHint: "「血染めの月」をクリアで解放。"
    }
  ];

  global.LUMINA_ENEMIES = ENEMIES;
  global.LUMINA_STAGES = STAGES;
})(window);
