/* Procedural sound engine (WebAudio). No external files => fully offline.
   Provides short SFX and a multi-track procedural music system. */
(function (global) {
  "use strict";

  var ctx = null;
  var master = null;
  var sfxGain = null;
  var musicGain = null;
  var musicTimer = null;
  var settings = { sound: true, music: true };

  function ensure() {
    if (ctx) return true;
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.6;
      sfxGain.connect(master);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.0;
      musicGain.connect(master);
      return true;
    } catch (e) { return false; }
  }

  function now() { return ctx.currentTime; }

  /* one short tone */
  function tone(opts) {
    if (!settings.sound || !ensure()) return;
    if (ctx.state === "suspended") ctx.resume();
    var t0 = now() + (opts.delay || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.toFreq) osc.frequency.exponentialRampToValueAtTime(opts.toFreq, t0 + opts.dur);
    var vol = opts.vol == null ? 0.4 : opts.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g); g.connect(sfxGain);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  /* filtered noise burst (whoosh / impact) */
  function noise(opts) {
    if (!settings.sound || !ensure()) return;
    if (ctx.state === "suspended") ctx.resume();
    var t0 = now() + (opts.delay || 0);
    var dur = opts.dur || 0.2;
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = opts.filter || "bandpass";
    filt.frequency.setValueAtTime(opts.freq || 800, t0);
    if (opts.toFreq) filt.frequency.exponentialRampToValueAtTime(opts.toFreq, t0 + dur);
    filt.Q.value = opts.q || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol == null ? 0.3 : opts.vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(sfxGain);
    src.start(t0);
  }

  // ===== music note helpers =====
  var ROOT = 220; // A3 reference used by SFX (powerup/life/lumLevel) -- keep stable.
  function noteFreq(semi) { return ROOT * Math.pow(2, semi / 12); }
  // generic frequency from an arbitrary root for music voices
  function freqFrom(root, semi) { return root * Math.pow(2, semi / 12); }

  /* a short voiced note routed to the music bus (used internally by tracks) */
  function mNote(opts) {
    if (!ctx) return;
    var t0 = now() + (opts.delay || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = opts.type || "triangle";
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.toFreq) osc.frequency.exponentialRampToValueAtTime(opts.toFreq, t0 + opts.dur);
    var vol = opts.vol == null ? 0.16 : opts.vol;
    var atk = opts.atk == null ? 0.04 : opts.atk;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    var dest = musicGain;
    if (opts.filter) {
      var filt = ctx.createBiquadFilter();
      filt.type = opts.filter;
      filt.frequency.value = opts.cutoff || 1200;
      filt.Q.value = opts.q || 0.7;
      osc.connect(g); g.connect(filt); filt.connect(dest);
    } else {
      osc.connect(g); g.connect(dest);
    }
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.05);
  }

  /* a soft percussive click/hat via noise routed to the music bus */
  function mPerc(opts) {
    if (!ctx) return;
    var t0 = now() + (opts.delay || 0);
    var dur = opts.dur || 0.06;
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = opts.filter || "highpass";
    filt.frequency.value = opts.freq || 5000;
    filt.Q.value = opts.q || 0.7;
    var g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol == null ? 0.08 : opts.vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(musicGain);
    src.start(t0);
  }

  // ===== track definitions =====
  // Each track: { interval (ms), root, scale[], play(step) }
  // play() schedules voices for the given step counter using mNote/mPerc.

  var SCALES = {
    minorPent: [0, 3, 5, 7, 10],
    majorPent: [0, 2, 4, 7, 9],
    major: [0, 2, 4, 5, 7, 9, 11],
    naturalMinor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    wholeTone: [0, 2, 4, 6, 8, 10]
  };

  function deg(scale, i) {
    var n = scale.length;
    var oct = Math.floor(i / n) * 12;
    return scale[((i % n) + n) % n] + oct;
  }

  var TRACKS = {
    // calm, spacious, gentle ambient (slow)
    menu: {
      interval: 620,
      root: 196, // G3
      scale: SCALES.majorPent,
      play: function (s) {
        var sc = this.scale, r = this.root;
        var idx = [0, 2, 4, 3, 5, 4, 2, 1][s % 8];
        mNote({ type: "sine", freq: freqFrom(r, deg(sc, idx) + 12), dur: 1.6, vol: 0.14, atk: 0.18 });
        if (s % 4 === 0) mNote({ type: "triangle", freq: freqFrom(r, deg(sc, 0)) / 2, dur: 2.2, vol: 0.12, atk: 0.25 });
        if (s % 8 === 6) mNote({ type: "sine", freq: freqFrom(r, deg(sc, 4) + 24), dur: 1.2, vol: 0.07, atk: 0.3 });
      }
    },
    // hopeful twilight, mid tempo, light
    stage1: {
      interval: 360,
      root: 220, // A3
      scale: SCALES.majorPent,
      play: function (s) {
        var sc = this.scale, r = this.root;
        var seq = [0, 2, 4, 5, 4, 2, 1, 3];
        mNote({ type: "triangle", freq: freqFrom(r, deg(sc, seq[s % seq.length]) + 12), dur: 0.6, vol: 0.16 });
        if (s % 2 === 0) mNote({ type: "sine", freq: freqFrom(r, deg(sc, 0)) / 2, dur: 0.9, vol: 0.16, atk: 0.04 });
        if (s % 4 === 2) mPerc({ freq: 6000, dur: 0.04, vol: 0.05 });
      }
    },
    // mysterious forest, minor, woody timbres
    stage2: {
      interval: 400,
      root: 174.6, // F3
      scale: SCALES.dorian,
      play: function (s) {
        var sc = this.scale, r = this.root;
        var seq = [0, 3, 2, 4, 1, 5, 3, 2];
        mNote({ type: "sawtooth", freq: freqFrom(r, deg(sc, seq[s % seq.length]) + 12), dur: 0.5, vol: 0.11, filter: "lowpass", cutoff: 900, q: 4 });
        if (s % 4 === 0) mNote({ type: "triangle", freq: freqFrom(r, deg(sc, 0)) / 2, dur: 1.1, vol: 0.15 });
        if (s % 8 === 5) mNote({ type: "sine", freq: freqFrom(r, deg(sc, 6) + 12), dur: 0.4, vol: 0.08, filter: "bandpass", cutoff: 1400, q: 6 });
      }
    },
    // cold / crystalline, sparse high bell-like tones, slow
    stage3: {
      interval: 560,
      root: 261.6, // C4
      scale: SCALES.lydian,
      play: function (s) {
        var sc = this.scale, r = this.root;
        if (s % 2 === 0) {
          var idx = [4, 6, 3, 7, 2, 5][(s / 2) % 6 | 0];
          mNote({ type: "sine", freq: freqFrom(r, deg(sc, idx) + 12), dur: 1.4, vol: 0.12, atk: 0.01 });
          mNote({ type: "sine", freq: freqFrom(r, deg(sc, idx) + 24), dur: 0.9, vol: 0.05, atk: 0.01, delay: 0.02 });
        }
        if (s % 8 === 0) mNote({ type: "triangle", freq: freqFrom(r, deg(sc, 0)) / 2, dur: 2.0, vol: 0.09, atk: 0.4 });
      }
    },
    // driving, marching, industrial / ashen, steadier bass
    stage4: {
      interval: 300,
      root: 146.8, // D3
      scale: SCALES.naturalMinor,
      play: function (s) {
        var sc = this.scale, r = this.root;
        // steady marching bass on every step
        mNote({ type: "square", freq: freqFrom(r, deg(sc, 0)) / 2, dur: 0.28, vol: 0.15, filter: "lowpass", cutoff: 600, q: 2 });
        var seq = [0, 0, 3, 0, 4, 0, 2, 0];
        if (seq[s % seq.length] !== 0 || s % 8 === 0)
          mNote({ type: "sawtooth", freq: freqFrom(r, deg(sc, seq[s % seq.length]) + 12), dur: 0.34, vol: 0.12, filter: "lowpass", cutoff: 1500, q: 1 });
        if (s % 2 === 1) mPerc({ freq: 3500, dur: 0.05, vol: 0.07 });
        if (s % 4 === 0) mPerc({ filter: "lowpass", freq: 180, dur: 0.12, vol: 0.18 });
      }
    },
    // tense, dark, faster, dissonant accents (blood moon)
    stage5: {
      interval: 240,
      root: 130.8, // C3
      scale: SCALES.phrygian,
      play: function (s) {
        var sc = this.scale, r = this.root;
        var seq = [0, 1, 0, 3, 0, 5, 1, 4];
        mNote({ type: "sawtooth", freq: freqFrom(r, deg(sc, seq[s % seq.length]) + 12), dur: 0.3, vol: 0.11, filter: "bandpass", cutoff: 1100, q: 3 });
        mNote({ type: "square", freq: freqFrom(r, deg(sc, 0)) / 2, dur: 0.22, vol: 0.16 });
        // dissonant tritone-ish accent
        if (s % 8 === 7) mNote({ type: "sawtooth", freq: freqFrom(r, deg(sc, 0) + 6 + 12), dur: 0.5, vol: 0.1, filter: "highpass", cutoff: 600 });
        if (s % 2 === 0) mPerc({ freq: 4500, dur: 0.04, vol: 0.06 });
      }
    },
    // epic build toward dawn -- faster, brighter resolve, fuller
    stage6: {
      interval: 260,
      root: 196, // G3
      scale: SCALES.major,
      play: function (s) {
        var sc = this.scale, r = this.root;
        var seq = [0, 2, 4, 6, 7, 6, 4, 2];
        mNote({ type: "triangle", freq: freqFrom(r, deg(sc, seq[s % seq.length]) + 12), dur: 0.45, vol: 0.15 });
        // chordal fifth layer for fullness
        mNote({ type: "sine", freq: freqFrom(r, deg(sc, seq[s % seq.length]) + 16), dur: 0.4, vol: 0.07, delay: 0.01 });
        mNote({ type: "square", freq: freqFrom(r, deg(sc, 0)) / 2, dur: 0.3, vol: 0.13, filter: "lowpass", cutoff: 1200 });
        if (s % 2 === 0) mPerc({ freq: 7000, dur: 0.03, vol: 0.05 });
        if (s % 4 === 0) mPerc({ filter: "lowpass", freq: 150, dur: 0.1, vol: 0.16 });
      }
    },
    // ominous, heavy, fast, low driving bass + tension (boss)
    boss: {
      interval: 220,
      root: 110, // A2
      scale: SCALES.naturalMinor,
      play: function (s) {
        var sc = this.scale, r = this.root;
        // relentless low driving bass
        mNote({ type: "sawtooth", freq: freqFrom(r, deg(sc, 0)), dur: 0.2, vol: 0.18, filter: "lowpass", cutoff: 500, q: 3 });
        var seq = [0, 0, 5, 0, 3, 0, 7, 1];
        mNote({ type: "square", freq: freqFrom(r, deg(sc, seq[s % seq.length]) + 12), dur: 0.26, vol: 0.1, filter: "lowpass", cutoff: 1400, q: 2 });
        // tension swell every bar
        if (s % 8 === 0) mNote({ type: "sawtooth", freq: freqFrom(r, deg(sc, 0) + 24), toFreq: freqFrom(r, deg(sc, 1) + 24), dur: 1.6, vol: 0.07, atk: 0.6, filter: "highpass", cutoff: 800 });
        mPerc({ filter: "lowpass", freq: 120, dur: 0.1, vol: 0.2 });
        if (s % 2 === 1) mPerc({ freq: 4000, dur: 0.04, vol: 0.07 });
      }
    }
  };

  var DEFAULT_TRACK = "menu";
  var desiredTrack = DEFAULT_TRACK; // remembered for arg-less startMusic()
  var activeTrack = null;           // currently playing track key, or null
  var step = 0;

  function startTimer(key) {
    var def = TRACKS[key] || TRACKS[DEFAULT_TRACK];
    step = 0;
    activeTrack = key;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    musicTimer = setInterval(function () {
      if (!settings.music || !ctx) return;
      try { def.play(step); } catch (e) { /* never let a tick throw */ }
      step++;
    }, def.interval);
    // play first step immediately
    if (settings.music && ctx) {
      try { def.play(step); } catch (e) {}
      step++;
    }
  }

  function resolveTrack(track) {
    if (track && TRACKS[track]) return track;
    return DEFAULT_TRACK;
  }

  var SFX = {
    currentTrack: null,

    init: function () { ensure(); if (ctx && ctx.state === "suspended") ctx.resume(); },
    setSettings: function (s) {
      settings.sound = !!s.sound;
      settings.music = !!s.music;
      if (musicGain && ctx) {
        musicGain.gain.cancelScheduledValues(now());
        musicGain.gain.linearRampToValueAtTime(settings.music ? 0.5 : 0.0, now() + 0.4);
      }
      if (!settings.music) this.stopMusic();
    },

    eat: function (combo) {
      var base = 520 + Math.min(20, combo || 0) * 28;
      tone({ type: "square", freq: base, toFreq: base * 1.5, dur: 0.09, vol: 0.22 });
    },
    boostStart: function () { noise({ filter: "highpass", freq: 300, toFreq: 2400, dur: 0.35, vol: 0.18 }); },
    kill: function () {
      noise({ filter: "lowpass", freq: 1800, toFreq: 120, dur: 0.4, vol: 0.4, q: 0.7 });
      tone({ type: "sawtooth", freq: 180, toFreq: 60, dur: 0.35, vol: 0.3, delay: 0.02 });
    },
    death: function () {
      tone({ type: "sawtooth", freq: 380, toFreq: 70, dur: 0.6, vol: 0.35 });
      noise({ filter: "lowpass", freq: 900, toFreq: 100, dur: 0.6, vol: 0.25 });
    },
    powerup: function () {
      [0, 4, 7, 12].forEach(function (s, i) {
        tone({ type: "triangle", freq: noteFreq(s) * 2, dur: 0.14, vol: 0.25, delay: i * 0.06 });
      });
    },
    life: function () {
      [0, 7, 12, 16].forEach(function (s, i) {
        tone({ type: "sine", freq: noteFreq(s) * 2, dur: 0.2, vol: 0.3, delay: i * 0.08 });
      });
    },
    click: function () { tone({ type: "square", freq: 440, toFreq: 660, dur: 0.05, vol: 0.18 }); },

    // ----- Lumina Survivor flavor -----
    lumPick: function () { tone({ type: "triangle", freq: 720, toFreq: 1040, dur: 0.06, vol: 0.10 }); },
    lumHurt: function () {
      tone({ type: "sawtooth", freq: 200, toFreq: 80, dur: 0.22, vol: 0.3 });
      noise({ filter: "lowpass", freq: 700, toFreq: 120, dur: 0.22, vol: 0.22 });
    },
    lumLevel: function () {
      [0, 4, 7, 12, 16].forEach(function (s, i) {
        tone({ type: "triangle", freq: noteFreq(s) * 2, dur: 0.18, vol: 0.26, delay: i * 0.05 });
      });
    },
    lumNova: function () { noise({ filter: "bandpass", freq: 240, toFreq: 1600, dur: 0.3, vol: 0.16, q: 0.6 }); },
    lumBoss: function () {
      tone({ type: "sawtooth", freq: 110, toFreq: 55, dur: 0.9, vol: 0.32 });
      tone({ type: "square", freq: 165, toFreq: 82, dur: 0.7, vol: 0.16, delay: 0.05 });
    },
    countdown: function (go) {
      if (go) tone({ type: "square", freq: 880, toFreq: 1320, dur: 0.25, vol: 0.3 });
      else tone({ type: "square", freq: 440, dur: 0.12, vol: 0.22 });
    },

    // ----- music -----
    startMusic: function (track) {
      if (!settings.music || !ensure()) return;
      if (ctx.state === "suspended") ctx.resume();
      var key = resolveTrack(track);
      desiredTrack = key;
      // already playing -> switch (crossfade-ish) instead of stacking timers
      if (musicTimer) {
        if (key === activeTrack) return; // same track, nothing to do
        this.setMusicTrack(key);
        return;
      }
      this.currentTrack = key;
      musicGain.gain.cancelScheduledValues(now());
      musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), now());
      musicGain.gain.linearRampToValueAtTime(0.5, now() + 1.0);
      startTimer(key);
    },

    setMusicTrack: function (track) {
      var key = resolveTrack(track);
      desiredTrack = key;
      if (!ensure() || !settings.music) { this.currentTrack = musicTimer ? key : this.currentTrack; return; }
      if (!musicTimer) {
        // not playing: just remember; will be used by next arg-less startMusic
        return;
      }
      if (key === activeTrack) return;
      if (ctx.state === "suspended") ctx.resume();
      // quick crossfade: dip volume, swap the timer, ramp back up
      var t = now();
      musicGain.gain.cancelScheduledValues(t);
      musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), t);
      musicGain.gain.linearRampToValueAtTime(0.12, t + 0.18);
      musicGain.gain.linearRampToValueAtTime(0.5, t + 0.6);
      startTimer(key);
      this.currentTrack = key;
    },

    stopMusic: function () {
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
      activeTrack = null;
      this.currentTrack = null;
      if (musicGain && ctx) {
        musicGain.gain.cancelScheduledValues(now());
        musicGain.gain.linearRampToValueAtTime(0.0, now() + 0.3);
      }
    }
  };

  global.SFX = SFX;
})(window);
