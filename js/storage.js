/* Local persistence: lives (with time-based regen), high scores, settings. */
(function (global) {
  "use strict";

  var KEY = "pocketArcade.v1";
  var MAX_LIVES = 5;
  var REGEN_MS = 3 * 60 * 1000; // 1 life every 3 minutes

  var DEFAULTS = {
    lives: MAX_LIVES,
    lastLifeTs: Date.now(),
    highScore: 0,        // legacy: snake's best (kept for backward compat)
    scores: {},          // per-game best scores, keyed by game id
    plays: 0,
    settings: { sound: true, music: true, haptics: true, control: "follow" }
  };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      var d = JSON.parse(raw);
      // merge with defaults so new fields appear
      var s = clone(DEFAULTS);
      for (var k in d) if (d.hasOwnProperty(k)) s[k] = d[k];
      s.settings = Object.assign({}, DEFAULTS.settings, d.settings || {});
      return s;
    } catch (e) {
      return clone(DEFAULTS);
    }
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var state = load();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* Apply time-based regeneration up to MAX_LIVES. */
  function regen() {
    if (state.lives >= MAX_LIVES) {
      state.lastLifeTs = Date.now();
      return;
    }
    var now = Date.now();
    var elapsed = now - state.lastLifeTs;
    if (elapsed >= REGEN_MS) {
      var gained = Math.floor(elapsed / REGEN_MS);
      state.lives = Math.min(MAX_LIVES, state.lives + gained);
      if (state.lives >= MAX_LIVES) {
        state.lastLifeTs = now;
      } else {
        state.lastLifeTs += gained * REGEN_MS;
      }
      save();
    }
  }

  var Storage = {
    MAX_LIVES: MAX_LIVES,
    REGEN_MS: REGEN_MS,

    getLives: function () { regen(); return state.lives; },

    /* ms until the next life regenerates, or 0 if full */
    nextLifeIn: function () {
      regen();
      if (state.lives >= MAX_LIVES) return 0;
      return Math.max(0, REGEN_MS - (Date.now() - state.lastLifeTs));
    },

    spendLife: function () {
      regen();
      if (state.lives <= 0) return false;
      var wasFull = state.lives >= MAX_LIVES;
      state.lives -= 1;
      if (wasFull) state.lastLifeTs = Date.now();
      save();
      return true;
    },

    addLife: function (n) {
      regen();
      n = n || 1;
      var wasFull = state.lives >= MAX_LIVES;
      state.lives = Math.min(MAX_LIVES, state.lives + n);
      if (wasFull) state.lastLifeTs = Date.now();
      save();
      return state.lives;
    },

    /* Best score for a game. With no id (or "snake") this returns the legacy
       top-level highScore so older saves keep working; other games live in
       the per-game `scores` map. */
    getHighScore: function (game) {
      if (!game || game === "snake") return state.highScore || 0;
      return (state.scores && state.scores[game]) || 0;
    },
    submitScore: function (score, game) {
      state.plays = (state.plays || 0) + 1;
      var best;
      if (!game || game === "snake") {
        if (score > state.highScore) { state.highScore = score; save(); return true; }
        save();
        return false;
      }
      state.scores = state.scores || {};
      best = state.scores[game] || 0;
      if (score > best) { state.scores[game] = score; save(); return true; }
      save();
      return false;
    },

    getSettings: function () { return Object.assign({}, state.settings); },
    setSetting: function (key, val) {
      state.settings[key] = val;
      save();
    }
  };

  global.Storage = Storage;
})(window);
