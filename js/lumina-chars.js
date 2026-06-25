(function (global) {
  "use strict";

  // ルミナ・サバイバー — プレイアブルキャラクター登録データ
  // window.LUMINA_CHARACTERS にキャラクター配列を割り当てる純データファイル。
  // stats は各キャラのベースライン補正（パッシブはこの上に重なる）。
  // 省略値の既定: hpMul1, speedMul1, dmgMul1, cdMul1, areaMul1,
  //               magnetMul1, xpMul1, armor0, regen0, amount0, crit0。

  global.LUMINA_CHARACTERS = [
    {
      key: "lux",
      name: "ルクス",
      title: "灯火の守人",
      desc: "常闇に最初の灯をともした守人。クセのない万能型で、どんな武器とも噛み合う安定の一手。初めての夜に。",
      color: "#ffd24a",
      icon: "🕯️",
      startWeapon: "bolt",
      stats: { hpMul: 1, speedMul: 1, dmgMul: 1, cdMul: 1, areaMul: 1, magnetMul: 1, xpMul: 1, armor: 0, regen: 0, amount: 0, crit: 0 },
      unlock: { type: "default" },
      unlockHint: ""
    },
    {
      key: "vela",
      name: "ヴェラ",
      title: "疾風の灯",
      desc: "風のように夜を駆ける軽量の灯。素早い移動と手数で立ち回るが、被弾には弱い。ヒット&アウェイ向き。",
      color: "#38e1c9",
      icon: "💨",
      startWeapon: "spark",
      stats: { hpMul: 0.85, speedMul: 1.3, cdMul: 0.9, dmgMul: 0.95 },
      unlock: { type: "default" },
      unlockHint: ""
    },
    {
      key: "garo",
      name: "ガロ",
      title: "不動の盾火",
      desc: "ヨルの群れを正面から受け止める頑健な守り手。打たれ強い代わりに動きと火力は控えめ。前線を支える壁役。",
      color: "#6c8cff",
      icon: "🛡️",
      startWeapon: "aura",
      stats: { hpMul: 1.5, armor: 0.1, speedMul: 0.9, dmgMul: 0.85, regen: 0.4 },
      unlock: { type: "default" },
      unlockHint: ""
    },
    {
      key: "ignis",
      name: "イグニス",
      title: "閃光の刃",
      desc: "一撃に全てを賭ける高火力の灯。攻撃は鋭いが体は脆い。被弾を避けて一方的に焼き払う玄人向け。",
      color: "#ff5d7a",
      icon: "🔥",
      startWeapon: "bolt",
      stats: { dmgMul: 1.25, hpMul: 0.7, cdMul: 0.95, speedMul: 1.05 },
      unlock: { type: "kills", n: 1500 },
      unlockHint: "累計1500体のヨルを討伐すると解放。"
    },
    {
      key: "sophia",
      name: "ソフィア",
      title: "識智の灯火",
      desc: "光のかけらを誰よりも早く集める学び手。経験値と回収範囲に長け、序盤から雪だるま式に強くなる。育成型。",
      color: "#9bffb0",
      icon: "📖",
      startWeapon: "halo",
      stats: { xpMul: 1.35, magnetMul: 1.45, dmgMul: 0.9, hpMul: 0.95 },
      unlock: { type: "level", n: 20 },
      unlockHint: "ひとつの探索でレベル20に到達すると解放。"
    },
    {
      key: "nyx",
      name: "ニクス",
      title: "宵闇の星詠み",
      desc: "夜空に星を撃ち放つ広域の灯。範囲と射程に優れ、群れをまとめて掃討する。手数より面で制圧する型。",
      color: "#b070ff",
      icon: "🌟",
      startWeapon: "star",
      stats: { areaMul: 1.4, dmgMul: 1.05, speedMul: 0.95, cdMul: 1.05 },
      unlock: { type: "time", sec: 480 },
      unlockHint: "ひとつの探索で8分間生き延びると解放。"
    },
    {
      key: "kai",
      name: "カイ",
      title: "氷結の番人",
      desc: "ヨルを凍てつかせて足を止める冷徹の灯。火力は平凡だが堅実に立ち回り、長期戦で真価を発揮する。",
      color: "#6c8cff",
      icon: "❄️",
      startWeapon: "frost",
      stats: { hpMul: 1.15, armor: 0.06, areaMul: 1.15, dmgMul: 0.95, regen: 0.3 },
      unlock: { type: "clear", stage: "stage2" },
      unlockHint: "ステージ2をクリアすると解放。"
    },
    {
      key: "fortuna",
      name: "フォルトゥナ",
      title: "賽振りの灯",
      desc: "運命を賭けて戦う気まぐれな灯。高い会心率で大きく跳ねるが、体は心許ない。一発逆転を狙うギャンブラー。",
      color: "#ff6cd8",
      icon: "🎲",
      startWeapon: "nova",
      stats: { crit: 0.18, dmgMul: 1.1, hpMul: 0.8, speedMul: 1.05 },
      unlock: { type: "bosses", n: 12 },
      unlockHint: "累計12体のボスを撃破すると解放。"
    },
    {
      key: "aurelia",
      name: "アウレリア",
      title: "黄金の調停者",
      desc: "あらゆる力を均整よく束ねる熟練の灯。すべてが平均以上の隙のない構成で、どんな状況にも応える上級万能型。",
      color: "#ffd24a",
      icon: "👑",
      startWeapon: "whip",
      stats: { hpMul: 1.1, dmgMul: 1.1, cdMul: 0.95, areaMul: 1.1, magnetMul: 1.15, crit: 0.05, regen: 0.3, armor: 0.04 },
      unlock: { type: "clear", stage: "stage5" },
      unlockHint: "ステージ5をクリアすると解放。"
    },
    {
      key: "umbra",
      name: "ウンブラ",
      title: "常闇を歩む者",
      desc: "幾夜もの探索を経て闇に最も近づいた灯。極端な高火力と高速を併せ持つが、命は儚い。常闇を制した者のための称号。",
      color: "#ff9a3d",
      icon: "🌑",
      startWeapon: "nova",
      stats: { dmgMul: 1.35, speedMul: 1.2, cdMul: 0.88, hpMul: 0.65, crit: 0.1, armor: 0.02 },
      unlock: { type: "plays", n: 25 },
      unlockHint: "25回の探索を重ねると解放。"
    }
  ];

})(typeof window !== "undefined" ? window : this);
