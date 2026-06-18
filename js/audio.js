/* Procedural sound engine (WebAudio). No external files => fully offline.
   Provides short SFX and an optional ambient music loop. */
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

  // ----- ambient music: slow arpeggio over a soft pad -----
  var SCALE = [0, 3, 5, 7, 10]; // minor pentatonic
  var ROOT = 220; // A3
  var step = 0;
  function noteFreq(semi) { return ROOT * Math.pow(2, semi / 12); }

  function musicTick() {
    if (!settings.music || !ctx) return;
    var deg = SCALE[step % SCALE.length];
    var oct = (Math.floor(step / SCALE.length) % 2) * 12;
    var f = noteFreq(deg + oct);
    var t0 = now();
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
    osc.connect(g); g.connect(musicGain);
    osc.start(t0); osc.stop(t0 + 1.0);
    // occasional bass
    if (step % 4 === 0) {
      var b = ctx.createOscillator(); var bg = ctx.createGain();
      b.type = "sine"; b.frequency.value = noteFreq(deg) / 2;
      bg.gain.setValueAtTime(0.0001, t0);
      bg.gain.exponentialRampToValueAtTime(0.22, t0 + 0.05);
      bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
      b.connect(bg); bg.connect(musicGain);
      b.start(t0); b.stop(t0 + 1.4);
    }
    step = (step + (Math.random() < 0.3 ? 2 : 1)) % 40;
  }

  var SFX = {
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
    countdown: function (go) {
      if (go) tone({ type: "square", freq: 880, toFreq: 1320, dur: 0.25, vol: 0.3 });
      else tone({ type: "square", freq: 440, dur: 0.12, vol: 0.22 });
    },

    startMusic: function () {
      if (!settings.music || !ensure()) return;
      if (ctx.state === "suspended") ctx.resume();
      if (musicTimer) return;
      musicGain.gain.cancelScheduledValues(now());
      musicGain.gain.linearRampToValueAtTime(0.5, now() + 1.0);
      step = 0;
      musicTimer = setInterval(musicTick, 380);
      musicTick();
    },
    stopMusic: function () {
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
      if (musicGain && ctx) {
        musicGain.gain.cancelScheduledValues(now());
        musicGain.gain.linearRampToValueAtTime(0.0, now() + 0.3);
      }
    }
  };

  global.SFX = SFX;
})(window);
