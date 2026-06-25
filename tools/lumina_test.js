/* Headless smoke + integration test for Lumina Survivor.
   Loads the full content stack (storage, audio, weapon/character/stage
   registries, engine) under a canvas/2D-context stub, validates the data
   contracts, runs the sim across stages/characters, and exercises the
   evolution flow via the engine's _test seam. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let t = 0;
const rafQueue = [];
const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};
function makeCtx() {
  const grad = { addColorStop: () => {} };
  const base = {
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
  return new Proxy(base, { get: (o, p) => (p in o ? o[p] : () => {}) });
}
function makeCanvas() {
  return {
    width: 0, height: 0, clientWidth: 390, clientHeight: 780,
    getContext: () => makeCtx(), addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
}
const document = {
  createElement: (tag) => (tag === "canvas" ? makeCanvas() : { getContext: () => makeCtx() }),
  getElementById: () => null, addEventListener: () => {},
};
const sandbox = {
  console,
  performance: { now: () => t },
  requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
  cancelAnimationFrame: () => {},
  devicePixelRatio: 2,
  localStorage, document,
  navigator: { vibrate: () => {} },
  AudioContext: undefined,
};
sandbox.window = sandbox;
sandbox.window.addEventListener = () => {};
sandbox.window.removeEventListener = () => {};
vm.createContext(sandbox);

const FILES = ["js/storage.js", "js/audio.js", "js/lumina-weapons.js", "js/lumina-chars.js", "js/lumina-stages.js", "js/lumina.js"];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), sandbox, { filename: f });

const { LuminaGame, LUMINA_WEAPONS, LUMINA_PASSIVES, LUMINA_CHARACTERS, LUMINA_STAGES, LUMINA_ENEMIES } = sandbox;
function assert(c, m) { if (!c) throw new Error("ASSERT: " + m); }

// ---------- data contract validation ----------
const wByKey = {}; LUMINA_WEAPONS.forEach((w) => { wByKey[w.key] = w; });
const pByKey = {}; LUMINA_PASSIVES.forEach((p) => { pByKey[p.key] = p; });
const eByKey = {}; LUMINA_ENEMIES.forEach((e) => { eByKey[e.key] = e; });

assert(LUMINA_CHARACTERS.length >= 8, "expected >=8 characters, got " + LUMINA_CHARACTERS.length);
assert(LUMINA_STAGES.length >= 6, "expected >=6 stages, got " + LUMINA_STAGES.length);
assert(LUMINA_WEAPONS.length >= 18, "expected >=18 weapons");
assert(LUMINA_PASSIVES.length >= 10, "expected >=10 passives");

const ARCHES = { shot: 1, orbit: 1, aura: 1, nova: 1, chain: 1, meteor: 1, whip: 1, zone: 1, boomerang: 1 };
LUMINA_WEAPONS.forEach((w) => {
  assert(ARCHES[w.archetype], w.key + " has unknown archetype " + w.archetype);
  assert(w.params && typeof w.params === "object", w.key + " missing params");
  if (w.evolvesTo) assert(wByKey[w.evolvesTo] && wByKey[w.evolvesTo].hidden, w.key + " evolvesTo missing/visible: " + w.evolvesTo);
  if (w.evolveWith) assert(pByKey[w.evolveWith], w.key + " evolveWith missing passive: " + w.evolveWith);
});
const STAT_KEYS = "dmgMul cdMul speedMul magnetMul xpMul areaMul projSpeedMul durationMul amount armor regen crit critMul hpMaxBonus luck".split(" ");
LUMINA_PASSIVES.forEach((p) => assert(STAT_KEYS.indexOf(p.stat) >= 0, p.key + " has unknown stat " + p.stat));
LUMINA_CHARACTERS.forEach((c) => assert(wByKey[c.startWeapon], c.key + " startWeapon missing: " + c.startWeapon));
const evolveBases = LUMINA_WEAPONS.filter((w) => w.evolvesTo).length;
assert(evolveBases >= 6, "expected >=6 evolvable weapons, got " + evolveBases);

let defaultStages = 0;
LUMINA_STAGES.forEach((s) => {
  assert(eByKey[s.boss], s.key + " boss missing enemy: " + s.boss);
  assert(s.bg && s.bg.top && s.bg.vignette, s.key + " bg incomplete");
  (s.roster || []).forEach((r) => assert(eByKey[r.type], s.key + " roster type missing: " + r.type));
  if (s.unlock && s.unlock.type === "default") defaultStages++;
});
assert(defaultStages >= 1, "expected at least one default-unlocked stage");
console.log("data OK: chars", LUMINA_CHARACTERS.length, "stages", LUMINA_STAGES.length, "weapons", LUMINA_WEAPONS.length, "(evolvable " + evolveBases + ") passives", LUMINA_PASSIVES.length, "enemies", LUMINA_ENEMIES.length);

// ---------- public API ----------
const chars = LuminaGame.getCharacters(), stages = LuminaGame.getStages();
assert(chars.length === LUMINA_CHARACTERS.length, "getCharacters count");
assert(stages.length === LUMINA_STAGES.length, "getStages count");

// ---------- run sim across several stage/character combos ----------
function runFrames(n, steer) {
  for (let i = 0; i < n; i++) {
    t += 16.7; if (steer) steer(i);
    const q = rafQueue.splice(0, rafQueue.length); q.forEach((fn) => fn(t));
  }
}
let totalLevelUps = 0, gameOvers = 0, lastStats = null, weaponList = [];
const combos = [["lux", "stage1"], ["vela", "stage3"], ["garo", "stage6"]];
for (const [cKey, sKey] of combos) {
  let over = false;
  LuminaGame.start(makeCanvas(), {
    character: cKey, stage: sKey,
    onStats: (s) => { lastStats = s; }, onWeapons: (w) => { weaponList = w; },
    onLevelUp: (choices, pick) => { totalLevelUps++; assert(choices.length, "empty choices"); pick(choices[0].id); },
    onGameOver: () => { over = true; gameOvers++; },
    onHurt: () => {}, onBoss: () => {}, onBossEnd: () => {}, onClear: () => {},
  });
  runFrames(2200, (i) => { const a = i * 0.006; LuminaGame.setMove(Math.cos(a) * 0.22, Math.sin(a) * 0.22); });
  LuminaGame.stop();
}
console.log("sim OK: combos run, totalLevelUps", totalLevelUps, "gameOvers", gameOvers, "lastStats", lastStats && { time: lastStats.time, level: lastStats.level, kills: lastStats.kills });
assert(lastStats, "onStats never called");
assert(totalLevelUps >= 1, "expected level-ups across runs");
assert(gameOvers >= 1, "expected at least one death");

// ---------- evolution flow (via _test seam) ----------
let evoApplied = 0;
const evoPairs = LUMINA_WEAPONS.filter((w) => w.evolvesTo && w.evolveWith).slice(0, 4);
for (const base of evoPairs) {
  LuminaGame.start(makeCanvas(), { character: "lux", stage: "stage1", onStats: () => {}, onWeapons: () => {}, onLevelUp: () => {}, onGameOver: () => {} });
  const ready = LuminaGame._test.forceEvolveReady(base.key);
  assert(ready, "evolveReady false for " + base.key);
  const choices = LuminaGame._test.rollChoices();
  const evo = choices.find((c) => c.id === "evo:" + base.key);
  assert(evo, "evolution not offered for " + base.key);
  LuminaGame._test.applyChoice("evo:" + base.key);
  assert(LuminaGame._test.hasWeapon(base.evolvesTo), base.key + " did not become " + base.evolvesTo);
  assert(!LuminaGame._test.hasWeapon(base.key), base.key + " not consumed on evolve");
  evoApplied++;
  LuminaGame.stop();
}
console.log("evolution OK:", evoApplied, "weapons evolved (offered + applied + base consumed)");

// ---------- pause / resume / stop ----------
LuminaGame.start(makeCanvas(), { character: "lux", stage: "stage1", onStats: () => {}, onWeapons: () => {}, onLevelUp: (c, p) => p(c[0].id), onGameOver: () => {} });
runFrames(60, () => LuminaGame.setMove(1, 0));
LuminaGame.pause(); assert(LuminaGame.isPaused(), "pause() did not register");
LuminaGame.resume(); runFrames(60, () => LuminaGame.setMove(0, 1));
LuminaGame.stop(); assert(!LuminaGame.isPlaying(), "stop() did not stop");

// ---------- storage per-game best ----------
const before = sandbox.Storage.getHighScore("lumina");
sandbox.Storage.submitScore(before + 123, "lumina");
assert(sandbox.Storage.getHighScore("lumina") === before + 123, "lumina best score not stored");
assert(sandbox.Storage.getHighScore("snake") !== before + 123, "lumina score leaked into snake");

console.log("ALL LUMINA HEADLESS CHECKS PASSED");
