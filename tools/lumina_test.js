/* Headless smoke test for Lumina Survivor: stub a canvas/2D-context that
   tolerates gradients + sprite baking, run the sim for thousands of frames
   while steering the player, and assert core invariants (no crashes, enemies
   spawn and die, XP/level-up flow works, player can take damage and die). */
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

// a 2D context stub: unknown members are no-ops, but gradient factories return
// objects with addColorStop so sprite/backdrop baking doesn't throw.
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
    getContext: () => makeCtx(),
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
}

const document = {
  createElement: (tag) => (tag === "canvas" ? makeCanvas() : { getContext: () => makeCtx() }),
  getElementById: () => null,
  addEventListener: () => {},
};

const sandbox = {
  console,
  performance: { now: () => t },
  requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
  cancelAnimationFrame: () => {},
  devicePixelRatio: 2,
  localStorage,
  document,
  navigator: { vibrate: () => {} },
};
sandbox.window = sandbox;
sandbox.window.addEventListener = () => {};
sandbox.window.removeEventListener = () => {};
vm.createContext(sandbox);

for (const f of ["js/storage.js", "js/audio.js", "js/lumina.js"]) {
  const code = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  vm.runInContext(code, sandbox, { filename: f });
}

const { LuminaGame } = sandbox;

let levelUps = 0, gameOvers = 0, lastStats = null, weaponList = [];
const canvas = makeCanvas();

LuminaGame.start(canvas, {
  onStats: (s) => { lastStats = s; },
  onWeapons: (w) => { weaponList = w; },
  onLevelUp: (choices, pick) => {
    levelUps++;
    if (!choices.length) throw new Error("level-up offered no choices");
    pick(choices[0].id); // always take the first option
  },
  onHurt: () => {},
  onBoss: () => {},
  onGameOver: () => { gameOvers++; },
});

function runFrames(n, steer) {
  for (let i = 0; i < n; i++) {
    t += 16.7;
    if (steer) steer(i);
    const q = rafQueue.splice(0, rafQueue.length);
    q.forEach((fn) => fn(t));
  }
}

// Drift slowly so chasing enemies die right next to the player and their lux
// shards land within magnet range — this exercises pickup + the level-up flow.
runFrames(3000, (i) => {
  const a = i * 0.006;
  LuminaGame.setMove(Math.cos(a) * 0.22, Math.sin(a) * 0.22);
});

console.log("frames ran. levelUps:", levelUps, "weapons:", weaponList.length,
  "lastStats:", lastStats && { time: lastStats.time, level: lastStats.level, kills: lastStats.kills });

if (!lastStats) throw new Error("onStats was never called");
if (levelUps < 1) throw new Error("expected at least one level-up");
if (lastStats.kills < 1) throw new Error("expected at least one kill");
if (weaponList.length < 1) throw new Error("expected a starting weapon");

// Now sit still in a corner of the swarm to take contact damage until death.
LuminaGame.setMove(0, 0);
runFrames(8000);

if (gameOvers < 1) throw new Error("expected the player to die when standing still");
console.log("player died as expected after standing still. gameOvers:", gameOvers);

// pause/resume should not throw and should be queryable
LuminaGame.start(canvas, {
  onStats: () => {}, onWeapons: () => {}, onLevelUp: (c, p) => p(c[0].id), onGameOver: () => {},
});
runFrames(60, () => LuminaGame.setMove(1, 0));
LuminaGame.pause();
if (!LuminaGame.isPaused()) throw new Error("pause() did not register");
LuminaGame.resume();
runFrames(60, () => LuminaGame.setMove(0, 1));
LuminaGame.stop();
if (LuminaGame.isPlaying()) throw new Error("stop() did not stop the game");

console.log("ALL LUMINA HEADLESS CHECKS PASSED");
