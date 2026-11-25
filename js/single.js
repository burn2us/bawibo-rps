/**
 * Single-Player 15-Win Streak Mode
 */
window.BawiboSingle = (() => {
  const { RPS_LIST, RPS_LABELS, RPS_SVGS, AI_CHARACTERS, judgeRPS } = window.BawiboAssets;

  let active = false;
  let playerId = '';
  let currentStreak = 0; // 0 = challenging stage 1 (1연승 도전), 14 = challenging stage 15 (15연승 도전)
  let myChoice = null;
  let oppChoice = null;
  let timeLeft = 10;
  let spinTimer = null;
  let countdownTimer = null;
  let nextStageTimer = null;
  let roundResolved = false;

  // Callbacks injected by app.js
  let ui = null;

  function init(uiHelpers) {
    ui = uiHelpers;
  }

  function start(id) {
    playerId = id;
    currentStreak = 0;
    active = true;
    ui.showScreen('game');
    startRound();
  }

  function stop() {
    active = false;
    clearAllTimers();
  }

  function clearAllTimers() {
    if (spinTimer) { clearInterval(spinTimer); spinTimer = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    if (nextStageTimer) { clearInterval(nextStageTimer); nextStageTimer = null; }
  }

  function getCurrentAI() {
    const idx = Math.min(currentStreak, AI_CHARACTERS.length - 1);
    return AI_CHARACTERS[idx];
  }

  function updateTopBar() {
    const stats = window.BawiboStorage.getStats(playerId);
    const ai = getCurrentAI();
    ui.setGameHeader({
      modeLabel: '싱글 15연승',
      playerId,
      recordText: `${window.BawiboStorage.formatRecord(stats)} · 현재 ${currentStreak}연승`,
      oppName: ai.name,
      oppSub: `${ai.stage}연승 도전 (${ai.title})`,
      oppAvatarSvg: ai.avatarSvg,
      timeLeft
    });
  }

  function startRound() {
    if (!active) return;
    clearAllTimers();
    myChoice = null;
    oppChoice = null;
    roundResolved = false;
    timeLeft = 10;

    updateTopBar();
    ui.resetArenaForRound(playerId, getCurrentAI().name);
    ui.showBottomMenu('rps');

    // Start spinning random RPS images on both sides
    let spinIdx = 0;
    spinTimer = setInterval(() => {
      spinIdx = (spinIdx + 1) % 3;
      const leftPick = RPS_LIST[Math.floor(Math.random() * 3)];
      const rightPick = RPS_LIST[(spinIdx + Math.floor(Math.random() * 2)) % 3];
      if (!myChoice) {
        ui.setLeftDisplay(RPS_SVGS[leftPick], '선택 중...');
      }
      ui.setRightDisplay(RPS_SVGS[rightPick], '고민 중...');
    }, 95);

    // 10-second choice timer
    countdownTimer = setInterval(() => {
      timeLeft -= 1;
      ui.updateTimer(timeLeft);
      if (timeLeft <= 3 && timeLeft > 0) {
        window.BawiboAudio.tick();
      }
      if (timeLeft <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        if (!roundResolved) {
          resolveRound(true);
        }
      }
    }, 1000);
  }

  function selectChoice(choice) {
    if (!active || roundResolved || myChoice) return;
    window.BawiboAudio.click();
    myChoice = choice;
    oppChoice = RPS_LIST[Math.floor(Math.random() * 3)];
    ui.highlightSelectedChoice(choice);
    resolveRound(false);
  }

  function resolveRound(isTimeout) {
    if (roundResolved) return;
    roundResolved = true;
    clearAllTimers();

    if (isTimeout && !myChoice) {
      // Timeout: guaranteed loss, AI picks a winning or random hand
      oppChoice = RPS_LIST[Math.floor(Math.random() * 3)];
      ui.setLeftDisplay(
        `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" fill="#2b1929" stroke="#ff5c7a" stroke-width="4"/><text x="60" y="72" text-anchor="middle" font-size="40">⏰</text></svg>`,
        '시간 초과!'
      );
      ui.setRightDisplay(RPS_SVGS[oppChoice], RPS_LABELS[oppChoice]);
    } else {
      ui.setLeftDisplay(RPS_SVGS[myChoice], RPS_LABELS[myChoice]);
      ui.setRightDisplay(RPS_SVGS[oppChoice], RPS_LABELS[oppChoice]);
    }

    ui.stopSpinning();
    ui.disableRpsButtons(true);

    const outcome = isTimeout && !myChoice ? 'lose' : judgeRPS(myChoice, oppChoice);

    if (outcome === 'win') {
      currentStreak += 1;
      window.BawiboStorage.recordResult(playerId, 'win', currentStreak);
      window.BawiboAudio.win();
      ui.setCardOutcomes('winner', 'loser');

      if (currentStreak >= 15) {
        ui.showResult('win', '승리', `${currentStreak}연승 달성!`, '세계 최강자 등극!');
        updateTopBar();
        setTimeout(() => {
          if (!active) return;
          active = false;
          ui.showChampionScreen(playerId);
        }, 1600);
        return;
      }

      let waitSec = 5;
      ui.showResult('win', '승리', `${currentStreak}연승!`, `${waitSec}초 후 다음 대결 시작`);
      updateTopBar();

      nextStageTimer = setInterval(() => {
        waitSec -= 1;
        if (!active) { clearInterval(nextStageTimer); return; }
        if (waitSec <= 0) {
          clearInterval(nextStageTimer);
          nextStageTimer = null;
          startRound();
        } else {
          ui.updateResultSub(`${waitSec}초 후 다음 대결 시작`);
        }
      }, 1000);
    } else if (outcome === 'draw') {
      window.BawiboStorage.recordResult(playerId, 'draw');
      window.BawiboAudio.draw();
      ui.setCardOutcomes('locked', 'locked');

      let waitSec = 3;
      ui.showResult('draw', '무승부', `현재 ${currentStreak}연승 유지`, `${waitSec}초 후 재대결`);
      updateTopBar();

      nextStageTimer = setInterval(() => {
        waitSec -= 1;
        if (!active) { clearInterval(nextStageTimer); return; }
        if (waitSec <= 0) {
          clearInterval(nextStageTimer);
          nextStageTimer = null;
          startRound();
        } else {
          ui.updateResultSub(`${waitSec}초 후 재대결`);
        }
      }, 1000);
    } else {
      // Loss: reset streak and offer Retry from 1-win or Main Menu
      const lostAt = currentStreak + 1;
      window.BawiboStorage.recordResult(playerId, 'lose');
      window.BawiboAudio.lose();
      ui.setCardOutcomes('loser', 'winner');

      const subMsg = isTimeout && !myChoice
        ? `10초 초과 패배 (${lostAt}연승 도전 실패)`
        : `${lostAt}연승 도전 실패`;
      ui.showResult('lose', '패배', '연승 초기화', subMsg);
      currentStreak = 0;
      updateTopBar();
      ui.showBottomMenu('single-lose');
    }
  }

  function retryFromStart() {
    if (!playerId) return;
    currentStreak = 0;
    active = true;
    startRound();
  }

  return {
    init,
    start,
    stop,
    selectChoice,
    retryFromStart
  };
})();
