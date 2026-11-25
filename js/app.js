/**
 * Main Application Controller & UI Renderer
 */
(() => {
  const { RPS_SVGS } = window.BawiboAssets;

  let currentMode = null; // 'single' | 'multi'
  let celebrationAnimId = null;

  // DOM Elements
  const screens = {
    main: document.getElementById('screen-main'),
    lobby: document.getElementById('screen-lobby'),
    room: document.getElementById('screen-room'),
    game: document.getElementById('screen-game'),
    champion: document.getElementById('screen-champion')
  };

  const idInput = document.getElementById('player-id-input');
  const idErrorMsg = document.getElementById('id-error-msg');
  const mainStatsBar = document.getElementById('main-stats-bar');
  const mainStatRecord = document.getElementById('main-stat-record');
  const mainStatBest = document.getElementById('main-stat-best');

  const toastContainer = document.getElementById('toast-container');
  const celebrationCanvas = document.getElementById('celebration-canvas');

  // Inject RPS SVGs into bottom buttons
  document.querySelectorAll('.rps-btn-svg[data-rps-icon]').forEach((el) => {
    const type = el.getAttribute('data-rps-icon');
    if (RPS_SVGS[type]) el.innerHTML = RPS_SVGS[type];
  });

  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      el.classList.toggle('active', key === name);
    });
    if (name !== 'champion') {
      stopCelebration();
    }
    if (name === 'main') {
      refreshMainStats();
    }
  }

  function toast(msg, type = 'info') {
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.textContent = msg;
    toastContainer.appendChild(div);
    setTimeout(() => {
      div.remove();
    }, 3200);
  }

  function refreshMainStats() {
    const id = idInput.value.trim();
    if (!id) {
      mainStatsBar.classList.add('hidden');
      return;
    }
    const stats = window.BawiboStorage.getStats(id);
    mainStatRecord.textContent = window.BawiboStorage.formatRecord(stats);
    mainStatBest.textContent = `${stats.bestStreak}연승`;
    mainStatsBar.classList.remove('hidden');
  }

  function validatePlayerId() {
    const id = idInput.value.trim();
    if (!id) {
      idErrorMsg.classList.remove('hidden');
      idInput.classList.remove('input-error');
      void idInput.offsetWidth; // trigger reflow for shake
      idInput.classList.add('input-error');
      idInput.focus();
      toast('아이디를 입력해야 게임을 시작할 수 있습니다!', 'warn');
      return null;
    }
    idErrorMsg.classList.add('hidden');
    idInput.classList.remove('input-error');
    window.BawiboStorage.setLastPlayerId(id);
    return id;
  }

  // ==================== SHARED UI HELPERS ====================
  const uiHelpers = {
    showScreen,
    toast,

    setConnStatus(cls, text) {
      const badge = document.getElementById('conn-status-badge');
      badge.className = `conn-badge ${cls}`;
      badge.textContent = text;
    },

    updateLobbyInfo(playerId, stats) {
      document.getElementById('lobby-player-id').textContent = playerId;
      document.getElementById('lobby-stat-record').textContent = window.BawiboStorage.formatRecord(stats);
      document.getElementById('lobby-stat-streak').textContent = `${stats.currentMultiStreak}연승`;
    },

    renderLobbyRooms(list, onJoin) {
      const container = document.getElementById('room-list');
      if (!list.length) {
        container.innerHTML = `<div class="empty-state">현재 열린 방이 없습니다. 방을 만들어 보세요!</div>`;
        return;
      }
      container.innerHTML = '';
      list.forEach((room) => {
        const item = document.createElement('div');
        item.className = 'room-item';
        const isFull = Boolean(room.guestClientId) || room.status !== 'waiting';
        const count = room.guestClientId ? '2/2' : '1/2';
        const statusText = room.status === 'playing' ? '게임중' : (isFull ? '인원꽉참' : '대기중');

        const info = document.createElement('div');
        info.className = 'room-info';
        const titleEl = document.createElement('div');
        titleEl.className = 'room-title';
        titleEl.textContent = room.title;
        const metaEl = document.createElement('div');
        metaEl.className = 'room-meta';
        metaEl.textContent = `방장: ${room.hostId} · 인원 ${count} · ${statusText}`;
        info.appendChild(titleEl);
        info.appendChild(metaEl);

        const btn = document.createElement('button');
        btn.className = 'btn btn-primary btn-sm';
        btn.textContent = isFull ? statusText : '입장';
        btn.disabled = isFull;
        btn.onclick = () => onJoin(room.roomId);

        item.appendChild(info);
        item.appendChild(btn);
        container.appendChild(item);
      });
    },

    updateWaitingRoom({ title, playerId, hostName, guestName, isHost, bothReady, autoLeft }) {
      document.getElementById('room-header-title').textContent = title;
      document.getElementById('room-player-id').textContent = playerId;
      document.getElementById('room-host-name').textContent = hostName || '-';

      const guestEl = document.getElementById('room-guest-name');
      if (guestName) {
        guestEl.textContent = guestName;
        guestEl.classList.remove('waiting');
      } else {
        guestEl.textContent = '대기 중...';
        guestEl.classList.add('waiting');
      }

      const countdownBox = document.getElementById('room-countdown-box');
      const waitingMsg = document.getElementById('room-waiting-msg');
      const startBtn = document.getElementById('btn-room-start');

      if (bothReady) {
        countdownBox.classList.remove('hidden');
        document.getElementById('room-auto-timer').textContent = autoLeft;
        waitingMsg.textContent = isHost
          ? '게임 시작 버튼을 누르거나 30초 후 자동 시작됩니다.'
          : '방장이 게임을 시작하거나 30초 후 자동 시작됩니다.';
        startBtn.classList.toggle('hidden', !isHost);
      } else {
        countdownBox.classList.add('hidden');
        waitingMsg.textContent = '다른 플레이어가 입장할 때까지 기다리고 있습니다...';
        startBtn.classList.add('hidden');
      }
    },

    updateRoomCountdown(sec) {
      document.getElementById('room-auto-timer').textContent = Math.max(0, sec);
    },

    setGameHeader({ modeLabel, playerId, recordText, oppName, oppSub, oppAvatarSvg, timeLeft }) {
      document.getElementById('game-mode-badge').textContent = modeLabel;
      document.getElementById('game-player-id').textContent = playerId;
      document.getElementById('game-record-text').textContent = recordText;
      document.getElementById('game-opp-name').textContent = oppName;
      document.getElementById('game-opp-sub').textContent = oppSub;
      document.getElementById('arena-opp-avatar').innerHTML = oppAvatarSvg || '';
      this.updateTimer(timeLeft);
    },

    updateTimer(sec) {
      const s = Math.max(0, sec);
      const circle = document.getElementById('game-timer-circle');
      const text = document.getElementById('game-timer-text');
      const bar = document.getElementById('game-timer-bar');
      text.textContent = s;
      bar.style.width = `${(s / 10) * 100}%`;
      const urgent = s <= 3;
      circle.classList.toggle('urgent', urgent);
      bar.classList.toggle('urgent', urgent);
    },

    resetArenaForRound(myName, oppName) {
      document.getElementById('arena-my-name').textContent = myName;
      document.getElementById('arena-opp-name').textContent = oppName;

      const myCard = document.getElementById('arena-my-card');
      const oppCard = document.getElementById('arena-opp-card');
      myCard.className = 'rps-display-card spinning';
      oppCard.className = 'rps-display-card spinning';

      document.getElementById('arena-vs-badge').classList.remove('hidden');
      document.getElementById('arena-result-box').classList.add('hidden');

      document.querySelectorAll('.rps-btn').forEach((b) => {
        b.classList.remove('selected');
        b.disabled = false;
      });
    },

    setLeftDisplay(svgHtml, label) {
      document.getElementById('arena-my-svg').innerHTML = svgHtml;
      document.getElementById('arena-my-choice-label').textContent = label;
    },

    setRightDisplay(svgHtml, label) {
      document.getElementById('arena-opp-svg').innerHTML = svgHtml;
      document.getElementById('arena-opp-choice-label').textContent = label;
    },

    highlightSelectedChoice(choice) {
      document.querySelectorAll('.rps-btn').forEach((b) => {
        b.classList.toggle('selected', b.getAttribute('data-choice') === choice);
      });
    },

    disableRpsButtons(disabled) {
      document.querySelectorAll('.rps-btn').forEach((b) => {
        b.disabled = disabled;
      });
    },

    stopSpinning() {
      document.getElementById('arena-my-card').classList.remove('spinning');
      document.getElementById('arena-opp-card').classList.remove('spinning');
    },

    setCardOutcomes(myCls, oppCls) {
      const myCard = document.getElementById('arena-my-card');
      const oppCard = document.getElementById('arena-opp-card');
      myCard.className = `rps-display-card ${myCls}`;
      oppCard.className = `rps-display-card ${oppCls}`;
    },

    showResult(type, title, streakText, subText) {
      document.getElementById('arena-vs-badge').classList.add('hidden');
      const box = document.getElementById('arena-result-box');
      const titleEl = document.getElementById('result-title');
      titleEl.className = `result-title ${type}`;
      titleEl.textContent = title;
      document.getElementById('result-streak').textContent = streakText;
      document.getElementById('result-sub').textContent = subText || '';
      box.classList.remove('hidden');
    },

    updateResultSub(subText) {
      document.getElementById('result-sub').textContent = subText;
    },

    showBottomMenu(which) {
      document.getElementById('rps-choice-menu').classList.toggle('hidden', which !== 'rps');
      document.getElementById('single-lose-menu').classList.toggle('hidden', which !== 'single-lose');
      document.getElementById('multi-post-menu').classList.toggle('hidden', which !== 'multi-post');
    },

    updateMultiPostTimer(sec, ready) {
      const timerEl = document.getElementById('multi-post-timer');
      const statusEl = document.getElementById('multi-post-status');
      const rematchBtn = document.getElementById('btn-multi-rematch');
      if (ready) {
        statusEl.innerHTML = `다시하기 준비 완료! (<strong id="multi-post-timer">${sec}</strong>초 후 자동 시작)`;
        rematchBtn.disabled = true;
        rematchBtn.textContent = '준비 완료';
      } else {
        statusEl.innerHTML = `계속하시겠습니까? (<strong id="multi-post-timer">${sec}</strong>초 후 자동 시작)`;
        rematchBtn.disabled = false;
        rematchBtn.textContent = '다시하기';
      }
      if (timerEl) timerEl.textContent = Math.max(0, sec);
    },

    showChampionScreen(playerId) {
      document.getElementById('champion-player-id').textContent = playerId;
      showScreen('champion');
      window.BawiboAudio.champion();
      startCelebration();
    }
  };

  // ==================== FIREWORKS / CONFETTI ====================
  function startCelebration() {
    celebrationCanvas.classList.remove('hidden');
    const ctx = celebrationCanvas.getContext('2d');
    let w = celebrationCanvas.width = window.innerWidth;
    let h = celebrationCanvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#ffd43b', '#ff5c7a', '#2ee59d', '#5b7cfa', '#ff922b', '#ffffff'];

    function spawnBurst() {
      const cx = Math.random() * w * 0.8 + w * 0.1;
      const cy = Math.random() * h * 0.5 + h * 0.1;
      const color = colors[Math.floor(Math.random() * colors.length)];
      for (let i = 0; i < 42; i++) {
        const angle = (Math.PI * 2 * i) / 42 + Math.random() * 0.15;
        const speed = 2 + Math.random() * 5.5;
        particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          size: 2.5 + Math.random() * 3,
          color
        });
      }
    }

    spawnBurst();
    let frame = 0;
    const loop = () => {
      frame += 1;
      if (frame % 28 === 0) spawnBurst();
      ctx.clearRect(0, 0, w, h);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;
        p.alpha -= 0.015;
        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      celebrationAnimId = requestAnimationFrame(loop);
    };
    celebrationAnimId = requestAnimationFrame(loop);
  }

  function stopCelebration() {
    if (celebrationAnimId) {
      cancelAnimationFrame(celebrationAnimId);
      celebrationAnimId = null;
    }
    celebrationCanvas.classList.add('hidden');
  }

  // ==================== EVENT BINDINGS ====================
  window.BawiboSingle.init(uiHelpers);
  window.BawiboMulti.init(uiHelpers);

  const savedId = window.BawiboStorage.getLastPlayerId();
  if (savedId) {
    idInput.value = savedId;
    refreshMainStats();
  }

  idInput.addEventListener('input', () => {
    if (idInput.value.trim()) {
      idErrorMsg.classList.add('hidden');
      idInput.classList.remove('input-error');
    }
    refreshMainStats();
  });

  function updateSoundIcons() {
    const icon = window.BawiboAudio.isMuted() ? '🔇' : '🔊';
    document.getElementById('btn-sound-toggle-main').textContent = icon;
    document.getElementById('btn-sound-toggle-game').textContent = icon;
  }

  document.getElementById('btn-sound-toggle-main').addEventListener('click', () => {
    window.BawiboAudio.toggleMute();
    updateSoundIcons();
  });
  document.getElementById('btn-sound-toggle-game').addEventListener('click', () => {
    window.BawiboAudio.toggleMute();
    updateSoundIcons();
  });

  document.getElementById('btn-single-mode').addEventListener('click', () => {
    const id = validatePlayerId();
    if (!id) return;
    window.BawiboAudio.click();
    currentMode = 'single';
    window.BawiboSingle.start(id);
  });

  document.getElementById('btn-multi-mode').addEventListener('click', () => {
    const id = validatePlayerId();
    if (!id) return;
    window.BawiboAudio.click();
    currentMode = 'multi';
    history.pushState({ bawiboMulti: true }, '');
    window.BawiboMulti.enterLobby(id);
  });

  // RPS choice buttons
  document.querySelectorAll('.rps-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const choice = btn.getAttribute('data-choice');
      if (currentMode === 'single') {
        window.BawiboSingle.selectChoice(choice);
      } else if (currentMode === 'multi') {
        window.BawiboMulti.selectChoice(choice);
      }
    });
  });

  // Single post-loss actions
  document.getElementById('btn-single-retry').addEventListener('click', () => {
    window.BawiboAudio.click();
    window.BawiboSingle.retryFromStart();
  });
  document.getElementById('btn-single-home').addEventListener('click', () => {
    window.BawiboAudio.click();
    window.BawiboSingle.stop();
    showScreen('main');
  });

  // Champion actions
  document.getElementById('btn-champ-retry').addEventListener('click', () => {
    window.BawiboAudio.click();
    stopCelebration();
    const id = validatePlayerId();
    if (id) {
      currentMode = 'single';
      window.BawiboSingle.start(id);
    }
  });
  document.getElementById('btn-champ-home').addEventListener('click', () => {
    window.BawiboAudio.click();
    stopCelebration();
    showScreen('main');
  });

  // Game exit button
  document.getElementById('btn-game-exit').addEventListener('click', () => {
    window.BawiboAudio.click();
    if (currentMode === 'single') {
      window.BawiboSingle.stop();
      showScreen('main');
    } else if (currentMode === 'multi') {
      window.BawiboMulti.exitMidGameByUser();
    }
  });

  // Lobby & Room controls
  document.getElementById('btn-lobby-back').addEventListener('click', () => {
    window.BawiboAudio.click();
    window.BawiboMulti.leaveToMain();
  });

  document.getElementById('btn-create-room').addEventListener('click', () => {
    window.BawiboAudio.click();
    const titleInput = document.getElementById('room-title-input');
    window.BawiboMulti.createRoom(titleInput.value);
    titleInput.value = '';
  });

  document.getElementById('btn-refresh-rooms').addEventListener('click', () => {
    window.BawiboAudio.click();
    window.BawiboMulti.renderRoomList();
  });

  document.getElementById('btn-room-leave').addEventListener('click', () => {
    window.BawiboMulti.leaveWaitingRoom(false);
  });

  document.getElementById('btn-room-start').addEventListener('click', () => {
    window.BawiboAudio.click();
    window.BawiboMulti.hostStartGame();
  });

  // Multi post-round actions
  document.getElementById('btn-multi-rematch').addEventListener('click', () => {
    window.BawiboMulti.chooseRematch();
  });
  document.getElementById('btn-multi-quit').addEventListener('click', () => {
    window.BawiboMulti.chooseQuit();
  });
})();
