/* App shell: screen routing, lives UI, settings, PWA install, and wiring the
   Snake game's callbacks to the HUD/overlays. */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var settings = Storage.getSettings();
  SFX.setSettings(settings);

  // ---------- screen routing ----------
  var screens = { home: $("screen-home"), snake: $("screen-snake") };
  var current = "home";
  function show(name) {
    if (screens[current]) screens[current].classList.remove("is-active");
    screens[name].classList.add("is-active");
    current = name;
  }

  // ---------- lives UI ----------
  var lifeInterval = null;
  function heartString(n, container) {
    var max = Storage.MAX_LIVES;
    container.innerHTML = "";
    for (var i = 0; i < max; i++) {
      var sp = document.createElement("span");
      sp.className = "h" + (i < n ? "" : " empty");
      sp.textContent = "♥";
      container.appendChild(sp);
    }
  }
  function fmtTime(ms) {
    var s = Math.ceil(ms / 1000);
    var m = Math.floor(s / 60); s = s % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  function refreshLives() {
    var lives = Storage.getLives();
    heartString(lives, $("hearts"));
    var t = Storage.nextLifeIn();
    $("life-timer").textContent = t > 0 ? "+♥ " + fmtTime(t) : "MAX";
    $("home-hi").textContent = Storage.getHighScore();
  }
  function startLifeTicker() { if (!lifeInterval) lifeInterval = setInterval(refreshLives, 1000); }

  // ---------- home interactions ----------
  $("game-list").addEventListener("click", function (e) {
    var card = e.target.closest(".game-card");
    if (!card) return;
    // "Coming soon" tiles: give a small nudge instead of launching.
    if (card.classList.contains("is-locked") || !card.dataset.game) {
      SFX.init(); SFX.click();
      card.classList.remove("nudge"); void card.offsetWidth; card.classList.add("nudge");
      return;
    }
    SFX.init(); SFX.click();
    if (card.dataset.game === "snake") {
      if (Storage.getLives() <= 0) {
        alert("ライフがありません。少し待つと回復します（または星⭐を5個集めると+1）。");
        return;
      }
      launchSnake();
    }
  });

  // show how many games are playable vs. total in the hub
  (function () {
    var cards = document.querySelectorAll("#game-list .game-card");
    var playable = document.querySelectorAll("#game-list .game-card[data-game]").length;
    var el = $("game-count");
    if (el) el.textContent = "あそべる " + playable + " / " + cards.length;
  })();

  // ---------- settings ----------
  function openSettings() { syncSettingsUI(); $("settings-overlay").hidden = false; }
  function closeSettings() { $("settings-overlay").hidden = true; }
  function syncSettingsUI() {
    $("set-sound").checked = settings.sound;
    $("set-music").checked = settings.music;
    $("set-haptics").checked = settings.haptics;
    document.querySelectorAll("#set-control button").forEach(function (b) {
      b.classList.toggle("active", b.dataset.mode === settings.control);
    });
  }
  $("btn-settings").addEventListener("click", function () { SFX.init(); SFX.click(); openSettings(); });
  $("btn-close-settings").addEventListener("click", function () { SFX.click(); closeSettings(); });
  $("set-sound").addEventListener("change", function (e) { settings.sound = e.target.checked; Storage.setSetting("sound", settings.sound); SFX.setSettings(settings); SFX.click(); });
  $("set-music").addEventListener("change", function (e) {
    settings.music = e.target.checked; Storage.setSetting("music", settings.music); SFX.setSettings(settings);
    if (settings.music && current === "snake") SFX.startMusic();
  });
  $("set-haptics").addEventListener("change", function (e) { settings.haptics = e.target.checked; Storage.setSetting("haptics", settings.haptics); });
  document.querySelectorAll("#set-control button").forEach(function (b) {
    b.addEventListener("click", function () {
      settings.control = b.dataset.mode; Storage.setSetting("control", settings.control);
      SnakeGame.setControl(settings.control); syncSettingsUI(); SFX.click();
    });
  });

  function vibrate(ms) { if (settings.haptics && navigator.vibrate) navigator.vibrate(ms); }

  // ---------- HUD elements ----------
  var leaderboard = $("leaderboard"), scoreEl = $("score"), comboPop = $("combo-pop");

  function renderLeaderboard(list, total, myRank) {
    var html = "";
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      html += '<div class="lb-row' + (r.me ? " me" : "") + '">' +
        '<span class="rank">' + (i + 1) + '</span>' +
        '<span class="dot" style="background:hsl(' + r.hue + ',85%,60%)"></span>' +
        '<span class="nm">' + escapeHtml(r.name) + '</span>' +
        '<span class="sc">' + r.score + '</span></div>';
    }
    if (myRank > list.length) {
      html += '<div class="lb-row me"><span class="rank">' + myRank + '</span>' +
        '<span class="dot" style="background:#38e1c9"></span>' +
        '<span class="nm">あなた</span><span class="sc">' + scoreEl.textContent + '</span></div>';
    }
    leaderboard.innerHTML = html;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  var lastScore = 0;
  function popCombo(text, cls) {
    comboPop.textContent = text;
    comboPop.classList.remove("show"); void comboPop.offsetWidth; comboPop.classList.add("show");
  }

  // ---------- launch / end game ----------
  var pendingScore = 0;
  function launchSnake() {
    show("snake");
    if (settings.music) SFX.startMusic();
    runCountdown(function () {
      SnakeGame.start($("game-canvas"), {
        control: settings.control,
        onScore: function (score, rank, list, total) {
          scoreEl.textContent = score;
          renderLeaderboard(list, total, rank);
        },
        onCombo: function (c) { popCombo("COMBO x" + c); },
        onKill: function (name) { popCombo("KILL! " + name); vibrate(30); },
        onPower: function (label) { popCombo(label); vibrate(20); },
        onEarnLife: function () { Storage.addLife(1); vibrate([20, 40, 20]); },
        onGameOver: function (score) { endGame(score); }
      });
      startLifeTicker();
    });
  }

  function runCountdown(done) {
    var el = $("countdown"); el.hidden = false;
    var seq = ["3", "2", "1", "GO!"]; var i = 0;
    function tick() {
      if (i >= seq.length) { el.hidden = true; el.innerHTML = ""; done(); return; }
      el.innerHTML = "<b>" + seq[i] + "</b>";
      SFX.countdown(i === seq.length - 1);
      i++; setTimeout(tick, 750);
    }
    tick();
  }

  function endGame(score) {
    pendingScore = score;
    var isBest = Storage.submitScore(score);
    Storage.spendLife(); // a death costs one life
    SFX.stopMusic();
    var lives = Storage.getLives();
    $("death-score").textContent = score;
    $("death-best").textContent = isBest ? "🎉 ベスト更新！" : "BEST " + Storage.getHighScore();
    heartString(lives, $("death-hearts"));
    var revive = $("btn-revive");
    if (lives > 0) {
      revive.disabled = false; revive.textContent = "❤ もう一度（ライフ -1）";
      $("death-note").textContent = "";
    } else {
      revive.disabled = true; revive.textContent = "ライフ切れ";
      $("death-note").textContent = "回復まで " + fmtTime(Storage.nextLifeIn()) + " ／ ホームで待ってね";
    }
    vibrate([40, 60, 40]);
    $("death-overlay").hidden = false;
    refreshLives();
  }

  // death overlay buttons
  $("btn-revive").addEventListener("click", function () {
    if (Storage.getLives() <= 0) return;
    SFX.click();
    $("death-overlay").hidden = true;
    if (settings.music) SFX.startMusic();
    runCountdown(function () { SnakeGame.respawnPlayer(); });
  });
  $("btn-home").addEventListener("click", function () {
    SFX.click(); SnakeGame.stop(); SFX.stopMusic();
    $("death-overlay").hidden = true;
    show("home"); refreshLives();
  });

  // ---------- pause ----------
  $("btn-pause").addEventListener("click", function () {
    SFX.click(); SnakeGame.pause(); $("pause-overlay").hidden = false; SFX.stopMusic();
  });
  $("btn-resume").addEventListener("click", function () {
    SFX.click(); $("pause-overlay").hidden = true; SnakeGame.resume();
    if (settings.music) SFX.startMusic();
  });
  $("btn-quit").addEventListener("click", function () {
    SFX.click(); SnakeGame.stop(); SFX.stopMusic();
    $("pause-overlay").hidden = true; show("home"); refreshLives();
  });
  $("btn-back").addEventListener("click", function () {
    SFX.click(); SnakeGame.pause(); $("pause-overlay").hidden = false; SFX.stopMusic();
  });

  // ---------- boost button ----------
  var boostBtn = $("boost-btn");
  function boostOn(e) { if (e && e.cancelable) e.preventDefault(); boostBtn.classList.add("active"); SnakeGame.setBoost(true); }
  function boostOff() { boostBtn.classList.remove("active"); SnakeGame.setBoost(false); }
  boostBtn.addEventListener("touchstart", boostOn, { passive: false });
  boostBtn.addEventListener("touchend", boostOff);
  boostBtn.addEventListener("touchcancel", boostOff);
  boostBtn.addEventListener("mousedown", boostOn);
  window.addEventListener("mouseup", boostOff);

  // pause when tab hidden
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && current === "snake" && SnakeGame.isPlaying()) {
      SnakeGame.pause(); $("pause-overlay").hidden = false; SFX.stopMusic();
    }
  });

  // ---------- PWA install ----------
  var deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); deferredPrompt = e;
    if (!sessionStorage.getItem("installDismissed")) $("install-toast").hidden = false;
  });
  $("btn-install").addEventListener("click", function () {
    $("install-toast").hidden = true;
    if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
  });
  $("btn-install-x").addEventListener("click", function () {
    $("install-toast").hidden = true; sessionStorage.setItem("installDismissed", "1");
  });

  // ---------- service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  // ---------- init ----------
  refreshLives();
  startLifeTicker();
})();
