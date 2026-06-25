(function (global) {
  "use strict";

  // ============================================================
  // ルミナ・サバイバー — 武器データ (window.LUMINA_WEAPONS)
  // 純粋なデータ定義。エンジンが各 archetype の挙動を実装する。
  // ============================================================

  var WEAPONS = [

    // ---- bolt (shot) ----------------------------------------
    {
      key: "bolt",
      name: "光の弾",
      icon: "💠",
      desc: "最も近い敵へ光弾を自動で放つ。基本にして万能。",
      color: "#6c8cff",
      archetype: "shot",
      maxLevel: 8,
      params: {
        interval: 0.9, intervalPer: -0.05, intervalMin: 0.3,
        dmg: 8, dmgPer: 3,
        count: 1, countPer: 0,
        pierce: 0, piercePer: 0,
        speed: 360, projR: 6, spread: 0.2, homing: 0,
        slow: 1, slowDur: 0
      },
      evolvesTo: "prismLance",
      evolveWith: "power",
      hidden: false
    },
    {
      key: "prismLance",
      name: "プリズム・ランス",
      icon: "🔱",
      desc: "屈折した極光が敵を貫き、無数の標的を一直線に焼き払う。",
      color: "#9bd4ff",
      archetype: "shot",
      maxLevel: 8,
      params: {
        interval: 0.5, intervalPer: -0.04, intervalMin: 0.2,
        dmg: 24, dmgPer: 7,
        count: 3, countPer: 0,
        pierce: 99, piercePer: 0,
        speed: 560, projR: 9, spread: 0.35, homing: 1.5,
        slow: 1, slowDur: 0
      },
      evolvesTo: null, evolveWith: null, hidden: true
    },

    // ---- halo (orbit) ---------------------------------------
    {
      key: "halo",
      name: "光輪",
      icon: "⭕",
      desc: "プレイヤーの周囲を回る光球。触れた敵に絶え間なく傷を刻む。",
      color: "#38e1c9",
      archetype: "orbit",
      maxLevel: 8,
      params: {
        count: 2, countPer: 0.5,
        dmg: 7, dmgPer: 2.5,
        radius: 70, radiusPer: 6,
        spin: 2.4, orbR: 14, tickCd: 0.4
      },
      evolvesTo: "saturnRing",
      evolveWith: "area",
      hidden: false
    },
    {
      key: "saturnRing",
      name: "土星の環",
      icon: "🪐",
      desc: "幾重もの光環が高速で渦巻き、近づく全てを粉砕する天体の盾。",
      color: "#5cffe0",
      archetype: "orbit",
      maxLevel: 8,
      params: {
        count: 5, countPer: 0.5,
        dmg: 20, dmgPer: 6,
        radius: 110, radiusPer: 8,
        spin: 4.2, orbR: 22, tickCd: 0.22
      },
      evolvesTo: null, evolveWith: null, hidden: true
    },

    // ---- aura (aura) ----------------------------------------
    {
      key: "aura",
      name: "聖光の輪",
      icon: "🌟",
      desc: "身を包む光の領域。内側の敵をじわじわと灼く。",
      color: "#ffd24a",
      archetype: "aura",
      maxLevel: 8,
      params: {
        radius: 90, radiusPer: 9,
        dmg: 5, dmgPer: 2,
        tick: 0.5,
        slow: 0.9, slowDur: 0.4
      },
      evolvesTo: "midnightSun",
      evolveWith: "area",
      hidden: false
    },
    {
      key: "midnightSun",
      name: "白夜の輪",
      icon: "☀️",
      desc: "常闇を払う巨大な太陽の領域。触れる影は瞬く間に蒸発する。",
      color: "#ffe79a",
      archetype: "aura",
      maxLevel: 8,
      params: {
        radius: 150, radiusPer: 14,
        dmg: 16, dmgPer: 5,
        tick: 0.3,
        slow: 0.6, slowDur: 0.8
      },
      evolvesTo: null, evolveWith: null, hidden: true
    },

    // ---- nova (nova) ----------------------------------------
    {
      key: "nova",
      name: "光衝波",
      icon: "💥",
      desc: "周期的に拡がる衝撃の輪。敵を弾き飛ばす。",
      color: "#ff6cd8",
      archetype: "nova",
      maxLevel: 8,
      params: {
        interval: 2.2, intervalPer: -0.1, intervalMin: 0.8,
        dmg: 9, dmgPer: 3,
        maxR: 130, maxRPer: 14,
        speed: 420, kb: 120,
        leavesZone: false, zoneDmg: 0, zoneLife: 0
      },
      evolvesTo: "supernova",
      evolveWith: "haste",
      hidden: false
    },
    {
      key: "supernova",
      name: "超新星",
      icon: "🌠",
      desc: "恒星の最期。圧倒的な衝撃波の後に灼熱の領域を残す。",
      color: "#ff9cea",
      archetype: "nova",
      maxLevel: 8,
      params: {
        interval: 1.3, intervalPer: -0.08, intervalMin: 0.5,
        dmg: 26, dmgPer: 7,
        maxR: 220, maxRPer: 20,
        speed: 560, kb: 240,
        leavesZone: true, zoneDmg: 8, zoneLife: 2.5
      },
      evolvesTo: null, evolveWith: null, hidden: true
    },

    // ---- spark (chain) --------------------------------------
    {
      key: "spark",
      name: "光の火花",
      icon: "⚡",
      desc: "敵から敵へ跳ね渡る電光。群れに刺さる。",
      color: "#9bffb0",
      archetype: "chain",
      maxLevel: 8,
      params: {
        interval: 1.4, intervalPer: -0.07, intervalMin: 0.5,
        jumps: 3, jumpsPer: 0.5,
        dmg: 7, dmgPer: 2.5,
        range: 200, stunDur: 0
      },
      evolvesTo: "heavenThunder",
      evolveWith: "haste",
      hidden: false
    },
    {
      key: "heavenThunder",
      name: "天雷",
      icon: "🌩️",
      desc: "天より落ちる裁きの雷。無数の影を貫き、痺れさせる。",
      color: "#c8ffd4",
      archetype: "chain",
      maxLevel: 8,
      params: {
        interval: 0.8, intervalPer: -0.05, intervalMin: 0.3,
        jumps: 8, jumpsPer: 1,
        dmg: 20, dmgPer: 6,
        range: 320, stunDur: 0.6
      },
      evolvesTo: null, evolveWith: null, hidden: true
    },

    // ---- star (meteor) --------------------------------------
    {
      key: "star",
      name: "流星",
      icon: "✨",
      desc: "天から光の星が降り注ぎ、着弾点を爆ぜさせる。",
      color: "#ffd24a",
      archetype: "meteor",
      maxLevel: 8,
      params: {
        interval: 2.4, intervalPer: -0.1, intervalMin: 1.0,
        count: 1, countPer: 0.5,
        aoe: 60, aoePer: 6,
        dmg: 12, dmgPer: 4
      },
      evolvesTo: "meteorShower",
      evolveWith: "multi",
      hidden: false
    },
    {
      key: "meteorShower",
      name: "流星群",
      icon: "🌌",
      desc: "夜空を埋め尽くす星の雨。広範囲を絶え間なく焦土に変える。",
      color: "#ffe79a",
      archetype: "meteor",
      maxLevel: 8,
      params: {
        interval: 1.2, intervalPer: -0.07, intervalMin: 0.5,
        count: 4, countPer: 1,
        aoe: 100, aoePer: 10,
        dmg: 28, dmgPer: 8
      },
      evolvesTo: null, evolveWith: null, hidden: true
    },

    // ---- frost (shot with slow) -----------------------------
    {
      key: "frost",
      name: "氷晶弾",
      icon: "❄️",
      desc: "凍てつく光弾。命中した敵の動きを鈍らせる。",
      color: "#9bd4ff",
      archetype: "shot",
      maxLevel: 8,
      params: {
        interval: 1.1, intervalPer: -0.05, intervalMin: 0.4,
        dmg: 6, dmgPer: 2.5,
        count: 1, countPer: 0.34,
        pierce: 1, piercePer: 0,
        speed: 320, projR: 7, spread: 0.25, homing: 0,
        slow: 0.6, slowDur: 1.5
      },
      evolvesTo: "absoluteZero",
      evolveWith: "power",
      hidden: false
    },
    {
      key: "absoluteZero",
      name: "絶対零度",
      icon: "🧊",
      desc: "全てを凍結させる絶対の冷気。敵はほぼ静止し、砕け散る。",
      color: "#d4f0ff",
      archetype: "shot",
      maxLevel: 8,
      params: {
        interval: 0.6, intervalPer: -0.04, intervalMin: 0.25,
        dmg: 18, dmgPer: 6,
        count: 4, countPer: 0.5,
        pierce: 5, piercePer: 0,
        speed: 420, projR: 11, spread: 0.4, homing: 1,
        slow: 0.2, slowDur: 2.5
      },
      evolvesTo: null, evolveWith: null, hidden: true
    },

    // ---- whip (whip) ----------------------------------------
    {
      key: "whip",
      name: "光鞭",
      icon: "🌀",
      desc: "進行方向へ弧を描いて薙ぎ払う光の鞭。",
      color: "#b070ff",
      archetype: "whip",
      maxLevel: 8,
      params: {
        interval: 1.0, intervalPer: -0.05, intervalMin: 0.4,
        dmg: 9, dmgPer: 3,
        range: 110, rangePer: 12,
        arc: 1.2, bothSides: false
      },
      evolvesTo: "auroraLash",
      evolveWith: "area",
      hidden: false
    },
    {
      key: "auroraLash",
      name: "極光の鞭",
      icon: "💜",
      desc: "前後を同時に薙ぐ極光の刃。広大な弧で敵を一掃する。",
      color: "#c89cff",
      archetype: "whip",
      maxLevel: 8,
      params: {
        interval: 0.55, intervalPer: -0.04, intervalMin: 0.25,
        dmg: 24, dmgPer: 7,
        range: 190, rangePer: 18,
        arc: 2.0, bothSides: true
      },
      evolvesTo: null, evolveWith: null, hidden: true
    },

    // ---- gravity (zone with pull) ---------------------------
    {
      key: "gravity",
      name: "重力場",
      icon: "🌑",
      desc: "敵を引き寄せ拘束する重力の領域を展開する。",
      color: "#b070ff",
      archetype: "zone",
      maxLevel: 8,
      params: {
        interval: 3.0, intervalPer: -0.12, intervalMin: 1.2,
        dmg: 5, dmgPer: 2,
        r: 90, rPer: 9,
        life: 3.0, tick: 0.4,
        pull: 80, slow: 0.7, slowDur: 0.5,
        follow: false
      },
      evolvesTo: "singularity",
      evolveWith: "duration",
      hidden: false
    },
    {
      key: "singularity",
      name: "特異点",
      icon: "⚫",
      desc: "全てを呑み込む黒き一点。引き込まれた影は逃れられず磨り潰される。",
      color: "#8c5cff",
      archetype: "zone",
      maxLevel: 8,
      params: {
        interval: 2.0, intervalPer: -0.1, intervalMin: 0.8,
        dmg: 16, dmgPer: 5,
        r: 150, rPer: 14,
        life: 5.0, tick: 0.25,
        pull: 220, slow: 0.4, slowDur: 1.0,
        follow: true
      },
      evolvesTo: null, evolveWith: null, hidden: true
    },

    // ---- boomerang (boomerang) ------------------------------
    {
      key: "boomerang",
      name: "光輪刃",
      icon: "🔃",
      desc: "飛び出して弧を描き、戻りながら敵を二度斬る光の刃。",
      color: "#38e1c9",
      archetype: "boomerang",
      maxLevel: 8,
      params: {
        interval: 1.3, intervalPer: -0.06, intervalMin: 0.5,
        count: 1, countPer: 0.5,
        dmg: 8, dmgPer: 3,
        range: 220, speed: 380, projR: 12
      },
      evolvesTo: "celestialDisc",
      evolveWith: "multi",
      hidden: false
    },
    {
      key: "celestialDisc",
      name: "天輪・廻光",
      icon: "🛞",
      desc: "幾枚もの光輪が乱舞し、戦場を縦横無尽に切り裂き続ける。",
      color: "#5cffe0",
      archetype: "boomerang",
      maxLevel: 8,
      params: {
        interval: 0.7, intervalPer: -0.05, intervalMin: 0.3,
        count: 4, countPer: 1,
        dmg: 22, dmgPer: 6,
        range: 320, speed: 520, projR: 18
      },
      evolvesTo: null, evolveWith: null, hidden: true
    },

    // ---- lance (shot: fast high-pierce line) ----------------
    {
      key: "lance",
      name: "光槍",
      icon: "📏",
      desc: "高速で直進する貫通の光槍。一列の敵をまとめて穿つ。",
      color: "#ffd24a",
      archetype: "shot",
      maxLevel: 8,
      params: {
        interval: 1.2, intervalPer: -0.05, intervalMin: 0.45,
        dmg: 9, dmgPer: 3.5,
        count: 1, countPer: 0,
        pierce: 4, piercePer: 0.5,
        speed: 620, projR: 5, spread: 0.1, homing: 0,
        slow: 1, slowDur: 0
      },
      evolvesTo: "lightSpear",
      evolveWith: "velocity",
      hidden: false
    },
    {
      key: "lightSpear",
      name: "神速の光槍",
      icon: "🗡️",
      desc: "音すら置き去る神速の槍。画面を一閃で貫き、何もかもを射抜く。",
      color: "#ffe79a",
      archetype: "shot",
      maxLevel: 8,
      params: {
        interval: 0.7, intervalPer: -0.04, intervalMin: 0.25,
        dmg: 26, dmgPer: 8,
        count: 2, countPer: 0.5,
        pierce: 99, piercePer: 0,
        speed: 1000, projR: 8, spread: 0.12, homing: 0,
        slow: 1, slowDur: 0
      },
      evolvesTo: null, evolveWith: null, hidden: true
    },

    // ---- pulse (nova: fast small) ---------------------------
    {
      key: "pulse",
      name: "光の鼓動",
      icon: "🔆",
      desc: "素早く脈打つ小さな衝撃波。近接の敵をこまめに払う。",
      color: "#9bffb0",
      archetype: "nova",
      maxLevel: 8,
      params: {
        interval: 1.0, intervalPer: -0.06, intervalMin: 0.35,
        dmg: 6, dmgPer: 2.5,
        maxR: 80, maxRPer: 8,
        speed: 480, kb: 40,
        leavesZone: false, zoneDmg: 0, zoneLife: 0
      },
      evolvesTo: "resonance",
      evolveWith: "haste",
      hidden: false
    },
    {
      key: "resonance",
      name: "共鳴波動",
      icon: "📡",
      desc: "途切れぬ高速の波動が共鳴し、自身を包む常時の破壊圏を生む。",
      color: "#c8ffd4",
      archetype: "nova",
      maxLevel: 8,
      params: {
        interval: 0.45, intervalPer: -0.03, intervalMin: 0.18,
        dmg: 15, dmgPer: 4.5,
        maxR: 140, maxRPer: 12,
        speed: 640, kb: 80,
        leavesZone: true, zoneDmg: 5, zoneLife: 1.2
      },
      evolvesTo: null, evolveWith: null, hidden: true
    }

  ];

  // ============================================================
  // ルミナ・サバイバー — パッシブ強化 (window.LUMINA_PASSIVES)
  // ============================================================

  var PASSIVES = [
    {
      key: "power", name: "力の結晶", icon: "🔥",
      desc: "与えるダメージが レベルごとに +12%。",
      maxLevel: 8, stat: "dmgMul", per: 0.12, mode: "add"
    },
    {
      key: "haste", name: "速攻の砂時計", icon: "⏱️",
      desc: "攻撃の間隔が レベルごとに 7% 短縮。",
      maxLevel: 8, stat: "cdMul", per: -0.07, mode: "add"
    },
    {
      key: "swift", name: "疾風の靴", icon: "👟",
      desc: "移動速度が レベルごとに +8%。",
      maxLevel: 8, stat: "speedMul", per: 0.08, mode: "add"
    },
    {
      key: "vigor", name: "生命の灯", icon: "❤️",
      desc: "最大HPが レベルごとに +22。増えた分だけ回復する。",
      maxLevel: 8, stat: "hpMaxBonus", per: 22, mode: "add"
    },
    {
      key: "regen", name: "再生の雫", icon: "💧",
      desc: "毎秒 HPを レベルごとに +0.5 回復する。",
      maxLevel: 8, stat: "regen", per: 0.5, mode: "add"
    },
    {
      key: "magnet", name: "誘引の磁石", icon: "🧲",
      desc: "アイテムの取得範囲が レベルごとに +25%。",
      maxLevel: 6, stat: "magnetMul", per: 0.25, mode: "add"
    },
    {
      key: "guard", name: "守りの鱗", icon: "🛡️",
      desc: "受けるダメージを レベルごとに 5% 軽減する。",
      maxLevel: 8, stat: "armor", per: 0.05, mode: "add"
    },
    {
      key: "greed", name: "強欲の硬貨", icon: "💰",
      desc: "獲得経験値が レベルごとに +10%。",
      maxLevel: 6, stat: "xpMul", per: 0.10, mode: "add"
    },
    {
      key: "area", name: "拡張の核", icon: "🌐",
      desc: "武器の効果範囲が レベルごとに +10%。",
      maxLevel: 8, stat: "areaMul", per: 0.10, mode: "add"
    },
    {
      key: "velocity", name: "加速の翼", icon: "🪽",
      desc: "弾の速度が レベルごとに +12%。",
      maxLevel: 6, stat: "projSpeedMul", per: 0.12, mode: "add"
    },
    {
      key: "duration", name: "持続の宝珠", icon: "⏳",
      desc: "領域や効果の持続時間が レベルごとに +12%。",
      maxLevel: 6, stat: "durationMul", per: 0.12, mode: "add"
    },
    {
      key: "multi", name: "増幅の双子", icon: "✳️",
      desc: "発射する弾の数が レベルごとに +1。",
      maxLevel: 3, stat: "amount", per: 1, mode: "add"
    },
    {
      key: "crit", name: "急所の眼", icon: "🎯",
      desc: "会心の発生率が レベルごとに +5%。",
      maxLevel: 8, stat: "crit", per: 0.05, mode: "add"
    },
    {
      key: "fortune", name: "幸運の四つ葉", icon: "🍀",
      desc: "運が上がり、より良い品やドロップが出やすくなる。",
      maxLevel: 6, stat: "luck", per: 0.12, mode: "add"
    }
  ];

  global.LUMINA_WEAPONS = WEAPONS;
  global.LUMINA_PASSIVES = PASSIVES;

})(window);
