/**
 * Multiplayer Mode: Lobby, Room (30s auto-start), Real-Time RPS,
 * 10s Choice & Rematch Timers, and Abnormal Disconnect Penalty/Forfeit Win.
 */
window.BawiboMulti = (() => {
  const { RPS_LIST, RPS_LABELS, RPS_SVGS, judgeRPS } = window.BawiboAssets;

  const BROKER_URLS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt'
  ];
  const TOPIC_PREFIX = 'bawibo/rps/v1';
  const BC_NAME = 'bawibo_local_rps_v1';

  let ui = null;
  let playerId = '';
  let clientId = '';
  let mqttClient = null;
  let mqttConnected = false;
  let bc = null;

  // State: 'idle' | 'lobby' | 'room_waiting' | 'playing' | 'post_round'
  let state = 'idle';
  let rooms = new Map(); // roomId -> roomObj
  let currentRoom = null;
  let isHost = false;
  let peerClientId = null;
  let peerPlayerId = null;

  // Timers
  let roomAutoStartTimer = null;
  let roomAutoLeft = 30;
  let spinTimer = null;
  let choiceTimer = null;
  let choiceLeft = 10;
  let graceTimer = null;
  let postTimer = null;
  let postLeft = 10;

  // Round state
  let roundId = 0;
  let myChoice = null;
  let oppChoice = null;
  let roundResolved = false;
  let myRematchReady = false;
  let oppRematchReady = false;
  let subscribedRoomTopic = null;
  let subscribedPresenceTopic = null;

  function init(uiHelpers) {
    ui = uiHelpers;
    clientId = 'p_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36).slice(-4);
    setupBroadcastChannel();
    setupUnloadHandlers();
  }

  function setupBroadcastChannel() {
    if (typeof BroadcastChannel === 'undefined') return;
    bc = new BroadcastChannel(BC_NAME);
    bc.onmessage = (e) => {
      const msg = e.data;
      if (!msg || msg.senderClientId === clientId) return;
      if (msg.channelType === 'room_update') {
        handleRoomMetaUpdate(msg.roomId, msg.room);
      } else if (msg.channelType === 'room_event' && currentRoom && msg.roomId === currentRoom.roomId) {
        handleRoomEvent(msg.event);
      } else if (msg.channelType === 'presence' && msg.clientId === peerClientId && msg.status === 'offline') {
        handlePeerDisconnected();
      }
    };
  }

  function setupUnloadHandlers() {
    const onAbruptExit = () => {
      if (state === 'playing' || state === 'post_round') {
        // Record 1 loss unconditionally for abnormal exit (tab close, refresh, back button)
        if (playerId) {
          window.BawiboStorage.recordResult(playerId, 'lose');
        }
        sendAbruptLeaveSync();
      } else if (state === 'room_waiting' && currentRoom) {
        sendRoomEvent({ type: 'waiting_leave', fromClientId: clientId, fromPlayerId: playerId });
        cleanupRoomIfHost();
      }
    };

    window.addEventListener('beforeunload', onAbruptExit);
    window.addEventListener('pagehide', onAbruptExit);
    window.addEventListener('popstate', () => {
      if (state === 'playing' || state === 'post_round') {
        onAbruptExit();
        ui.toast('게임 중 뒤로가기로 인해 1패가 기록되었습니다.', 'error');
        returnToLobby();
      } else if (state === 'room_waiting') {
        leaveWaitingRoom(true);
      }
    });
  }

  function sendAbruptLeaveSync() {
    if (!currentRoom) return;
    const evt = { type: 'abrupt_leave', fromClientId: clientId, fromPlayerId: playerId };
    sendRoomEvent(evt);
    if (isHost) cleanupRoomIfHost();
  }

  function connectTransport() {
    if (mqttClient && mqttConnected) {
      ui.setConnStatus('online', '온라인 연결됨');
      return;
    }
    if (typeof window.mqtt === 'undefined') {
      ui.setConnStatus('local', '로컬 탭 모드');
      return;
    }

    ui.setConnStatus('connecting', '서버 연결 중...');
    const presenceTopic = `${TOPIC_PREFIX}/presence/${clientId}`;
    const willPayload = JSON.stringify({ clientId, status: 'offline' });

    let brokerIdx = 0;
    const tryConnect = () => {
      if (mqttClient) {
        try { mqttClient.end(true); } catch {}
      }
      const url = BROKER_URLS[brokerIdx];
      mqttClient = window.mqtt.connect(url, {
        clientId: 'bawibo_' + clientId,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 0,
        will: {
          topic: presenceTopic,
          payload: willPayload,
          qos: 1,
          retain: false
        }
      });

      mqttClient.on('connect', () => {
        mqttConnected = true;
        ui.setConnStatus('online', '온라인 연결됨');
        mqttClient.subscribe(`${TOPIC_PREFIX}/rooms/+`, { qos: 0 });
        mqttClient.publish(presenceTopic, JSON.stringify({ clientId, status: 'online' }), { qos: 0 });
      });

      mqttClient.on('message', (topic, message) => {
        const raw = message.toString();
        if (topic.startsWith(`${TOPIC_PREFIX}/rooms/`)) {
          const rId = topic.split('/').pop();
          if (!raw) {
            handleRoomMetaUpdate(rId, null);
          } else {
            try {
              handleRoomMetaUpdate(rId, JSON.parse(raw));
            } catch {}
          }
        } else if (subscribedRoomTopic && topic === subscribedRoomTopic) {
          try {
            const evt = JSON.parse(raw);
            if (evt.fromClientId !== clientId) {
              handleRoomEvent(evt);
            }
          } catch {}
        } else if (subscribedPresenceTopic && topic === subscribedPresenceTopic) {
          try {
            const p = JSON.parse(raw);
            if (p.clientId === peerClientId && p.status === 'offline') {
              handlePeerDisconnected();
            }
          } catch {}
        }
      });

      mqttClient.on('error', () => {
        if (!mqttConnected && brokerIdx + 1 < BROKER_URLS.length) {
          brokerIdx += 1;
          tryConnect();
        } else if (!mqttConnected) {
          ui.setConnStatus('local', '로컬 탭 모드');
        }
      });

      mqttClient.on('close', () => {
        if (mqttConnected) {
          mqttConnected = false;
          ui.setConnStatus('local', '로컬 탭 모드');
        }
      });
    };

    tryConnect();
  }

  function publishRoomMeta(roomId, roomObj) {
    const payload = roomObj ? JSON.stringify(roomObj) : '';
    if (mqttClient && mqttConnected) {
      mqttClient.publish(`${TOPIC_PREFIX}/rooms/${roomId}`, payload, { qos: 1, retain: true });
    }
    if (bc) {
      bc.postMessage({ senderClientId: clientId, channelType: 'room_update', roomId, room: roomObj });
    }
    handleRoomMetaUpdate(roomId, roomObj);
  }

  function sendRoomEvent(event) {
    if (!currentRoom) return;
    const roomId = currentRoom.roomId;
    if (mqttClient && mqttConnected) {
      mqttClient.publish(`${TOPIC_PREFIX}/room/${roomId}`, JSON.stringify(event), { qos: 1 });
    }
    if (bc) {
      bc.postMessage({ senderClientId: clientId, channelType: 'room_event', roomId, event });
    }
  }

  function subscribeRoom(roomId) {
    const topic = `${TOPIC_PREFIX}/room/${roomId}`;
    if (subscribedRoomTopic && mqttClient && mqttConnected) {
      mqttClient.unsubscribe(subscribedRoomTopic);
    }
    subscribedRoomTopic = topic;
    if (mqttClient && mqttConnected) {
      mqttClient.subscribe(topic, { qos: 1 });
    }
  }

  function subscribePeerPresence(pClientId) {
    if (!pClientId) return;
    const topic = `${TOPIC_PREFIX}/presence/${pClientId}`;
    if (subscribedPresenceTopic && mqttClient && mqttConnected) {
      mqttClient.unsubscribe(subscribedPresenceTopic);
    }
    subscribedPresenceTopic = topic;
    if (mqttClient && mqttConnected) {
      mqttClient.subscribe(topic, { qos: 1 });
    }
  }

  function unsubscribeRoomAndPeer() {
    if (subscribedRoomTopic && mqttClient && mqttConnected) {
      mqttClient.unsubscribe(subscribedRoomTopic);
    }
    if (subscribedPresenceTopic && mqttClient && mqttConnected) {
      mqttClient.unsubscribe(subscribedPresenceTopic);
    }
    subscribedRoomTopic = null;
    subscribedPresenceTopic = null;
  }

  function handleRoomMetaUpdate(roomId, roomObj) {
    if (!roomObj) {
      rooms.delete(roomId);
    } else {
      // Ignore stale rooms older than 10 minutes
      if (Date.now() - roomObj.updatedAt > 10 * 60 * 1000) {
        rooms.delete(roomId);
      } else {
        rooms.set(roomId, roomObj);
      }
    }
    if (state === 'lobby') {
      renderRoomList();
    }
  }

  function renderRoomList() {
    const list = Array.from(rooms.values())
      .filter(r => Date.now() - r.updatedAt < 10 * 60 * 1000)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    ui.renderLobbyRooms(list, (roomId) => joinRoom(roomId));
  }

  function enterLobby(id) {
    playerId = id;
    state = 'lobby';
    clearAllTimers();
    currentRoom = null;
    peerClientId = null;
    peerPlayerId = null;
    isHost = false;

    connectTransport();
    const stats = window.BawiboStorage.getStats(playerId);
    ui.updateLobbyInfo(playerId, stats);
    ui.showScreen('lobby');
    renderRoomList();
  }

  function leaveToMain() {
    clearAllTimers();
    unsubscribeRoomAndPeer();
    state = 'idle';
    currentRoom = null;
    ui.showScreen('main');
  }

  function createRoom(titleInput) {
    const title = (titleInput || '').trim() || `${playerId}님의 대결방`;
    const roomId = 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const roomObj = {
      roomId,
      title,
      hostId: playerId,
      hostClientId: clientId,
      guestId: null,
      guestClientId: null,
      status: 'waiting',
      updatedAt: Date.now()
    };

    currentRoom = roomObj;
    isHost = true;
    peerClientId = null;
    peerPlayerId = null;
    state = 'room_waiting';

    subscribeRoom(roomId);
    publishRoomMeta(roomId, roomObj);
    enterWaitingRoomUI();
  }

  function joinRoom(roomId) {
    const room = rooms.get(roomId);
    if (!room) {
      ui.toast('존재하지 않거나 닫힌 방입니다.', 'error');
      renderRoomList();
      return;
    }
    if (room.guestClientId || room.status !== 'waiting') {
      ui.toast('이미 인원이 찼거나 게임 중인 방입니다.', 'warn');
      return;
    }

    currentRoom = { ...room };
    isHost = false;
    peerClientId = room.hostClientId;
    peerPlayerId = room.hostId;
    state = 'room_waiting';

    subscribeRoom(roomId);
    subscribePeerPresence(peerClientId);
    sendRoomEvent({
      type: 'join_request',
      fromClientId: clientId,
      fromPlayerId: playerId
    });
    enterWaitingRoomUI();
  }

  function enterWaitingRoomUI() {
    ui.showScreen('room');
    ui.updateWaitingRoom({
      title: currentRoom.title,
      playerId,
      hostName: currentRoom.hostId,
      guestName: currentRoom.guestId,
      isHost,
      bothReady: Boolean(currentRoom.hostId && currentRoom.guestId),
      autoLeft: 30
    });
  }

  function startRoomAutoTimer() {
    if (roomAutoStartTimer) clearInterval(roomAutoStartTimer);
    roomAutoLeft = 30;
    ui.updateRoomCountdown(roomAutoLeft);
    roomAutoStartTimer = setInterval(() => {
      if (state !== 'room_waiting') {
        clearInterval(roomAutoStartTimer);
        roomAutoStartTimer = null;
        return;
      }
      roomAutoLeft -= 1;
      ui.updateRoomCountdown(roomAutoLeft);
      if (roomAutoLeft <= 0) {
        clearInterval(roomAutoStartTimer);
        roomAutoStartTimer = null;
        if (isHost) {
          hostStartGame();
        }
      }
    }, 1000);
  }

  function hostStartGame() {
    if (!isHost || state !== 'room_waiting' || !currentRoom || !currentRoom.guestClientId) return;
    if (roomAutoStartTimer) { clearInterval(roomAutoStartTimer); roomAutoStartTimer = null; }
    currentRoom.status = 'playing';
    currentRoom.updatedAt = Date.now();
    publishRoomMeta(currentRoom.roomId, currentRoom);
    sendRoomEvent({
      type: 'start_game',
      fromClientId: clientId,
      fromPlayerId: playerId,
      roundId: 1
    });
    beginGame(1);
  }

  function leaveWaitingRoom(silent = false) {
    if (state !== 'room_waiting') return;
    if (!silent) window.BawiboAudio.click();
    sendRoomEvent({
      type: 'waiting_leave',
      fromClientId: clientId,
      fromPlayerId: playerId
    });
    cleanupRoomIfHost();
    returnToLobby();
  }

  function cleanupRoomIfHost() {
    if (isHost && currentRoom) {
      publishRoomMeta(currentRoom.roomId, null);
    }
  }

  function handleRoomEvent(evt) {
    if (!evt || !currentRoom) return;

    switch (evt.type) {
      case 'join_request': {
        if (!isHost || state !== 'room_waiting') return;
        if (currentRoom.guestClientId && currentRoom.guestClientId !== evt.fromClientId) {
          sendRoomEvent({ type: 'join_rejected', fromClientId: clientId, targetClientId: evt.fromClientId });
          return;
        }
        currentRoom.guestClientId = evt.fromClientId;
        currentRoom.guestId = evt.fromPlayerId;
        currentRoom.updatedAt = Date.now();
        peerClientId = evt.fromClientId;
        peerPlayerId = evt.fromPlayerId;
        subscribePeerPresence(peerClientId);
        publishRoomMeta(currentRoom.roomId, currentRoom);
        sendRoomEvent({
          type: 'join_accepted',
          fromClientId: clientId,
          fromPlayerId: playerId,
          targetClientId: evt.fromClientId,
          room: currentRoom
        });
        enterWaitingRoomUI();
        startRoomAutoTimer();
        break;
      }

      case 'join_accepted': {
        if (isHost || evt.targetClientId !== clientId) return;
        currentRoom = evt.room;
        peerClientId = currentRoom.hostClientId;
        peerPlayerId = currentRoom.hostId;
        enterWaitingRoomUI();
        startRoomAutoTimer();
        break;
      }

      case 'join_rejected': {
        if (evt.targetClientId === clientId) {
          ui.toast('방이 이미 꽉 찼습니다.', 'warn');
          returnToLobby();
        }
        break;
      }

      case 'waiting_leave': {
        if (state === 'room_waiting') {
          ui.toast(`${evt.fromPlayerId || '상대방'}님이 방을 나갔습니다. 대기실로 이동합니다.`, 'warn');
          cleanupRoomIfHost();
          returnToLobby();
        }
        break;
      }

      case 'start_game': {
        if (state === 'room_waiting') {
          if (roomAutoStartTimer) { clearInterval(roomAutoStartTimer); roomAutoStartTimer = null; }
          beginGame(evt.roundId || 1);
        }
        break;
      }

      case 'choice': {
        if (state !== 'playing' || evt.roundId !== roundId) return;
        oppChoice = evt.choice;
        if (!roundResolved) {
          if (myChoice) {
            resolveRound();
          } else {
            ui.setRightDisplay(
              `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" fill="#1e2a4a" stroke="#20c997" stroke-width="4"/><text x="60" y="72" text-anchor="middle" font-size="38">✔</text></svg>`,
              '선택 완료'
            );
          }
        }
        break;
      }

      case 'rematch_ready': {
        if (state !== 'post_round' || evt.roundId !== roundId) return;
        oppRematchReady = true;
        if (myRematchReady && oppRematchReady) {
          startNextRound();
        } else {
          ui.toast(`${peerPlayerId}님이 다시하기를 선택했습니다.`, 'success');
        }
        break;
      }

      case 'quit_normal': {
        if (state === 'playing' || state === 'post_round') {
          ui.toast(`${peerPlayerId || '상대방'}님이 그만하기를 선택해 대기실로 이동합니다.`, 'warn');
          cleanupRoomIfHost();
          returnToLobby();
        }
        break;
      }

      case 'abrupt_leave': {
        handlePeerDisconnected();
        break;
      }
    }
  }

  function handlePeerDisconnected() {
    if (state === 'room_waiting') {
      ui.toast('상대방의 연결이 끊어져 대기실로 이동합니다.', 'warn');
      cleanupRoomIfHost();
      returnToLobby();
    } else if (state === 'playing' || state === 'post_round') {
      // Remaining player gets 1 win unconditionally and returns to lobby
      window.BawiboStorage.recordResult(playerId, 'win');
      window.BawiboAudio.win();
      ui.toast(`${peerPlayerId || '상대방'}님이 게임 중 나가서 부전승(1승)을 획득했습니다!`, 'success');
      cleanupRoomIfHost();
      returnToLobby();
    }
  }

  function returnToLobby() {
    clearAllTimers();
    unsubscribeRoomAndPeer();
    currentRoom = null;
    peerClientId = null;
    peerPlayerId = null;
    isHost = false;
    enterLobby(playerId);
  }

  function clearAllTimers() {
    if (roomAutoStartTimer) { clearInterval(roomAutoStartTimer); roomAutoStartTimer = null; }
    if (spinTimer) { clearInterval(spinTimer); spinTimer = null; }
    if (choiceTimer) { clearInterval(choiceTimer); choiceTimer = null; }
    if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
    if (postTimer) { clearInterval(postTimer); postTimer = null; }
  }

  function beginGame(rId) {
    state = 'playing';
    roundId = rId;
    ui.showScreen('game');
    startRound();
  }

  function updateGameHeader() {
    const stats = window.BawiboStorage.getStats(playerId);
    ui.setGameHeader({
      modeLabel: '멀티 대전',
      playerId,
      recordText: `${window.BawiboStorage.formatRecord(stats)} · ${stats.currentMultiStreak}연승`,
      oppName: peerPlayerId || '상대방',
      oppSub: `라운드 ${roundId}`,
      oppAvatarSvg: '',
      timeLeft: choiceLeft
    });
  }

  function startRound() {
    clearAllTimers();
    state = 'playing';
    myChoice = null;
    oppChoice = null;
    roundResolved = false;
    myRematchReady = false;
    oppRematchReady = false;
    choiceLeft = 10;

    updateGameHeader();
    ui.resetArenaForRound(playerId, peerPlayerId || '상대방');
    ui.showBottomMenu('rps');

    let spinIdx = 0;
    spinTimer = setInterval(() => {
      spinIdx = (spinIdx + 1) % 3;
      if (!myChoice) {
        ui.setLeftDisplay(RPS_SVGS[RPS_LIST[Math.floor(Math.random() * 3)]], '선택 중...');
      }
      if (!oppChoice) {
        ui.setRightDisplay(RPS_SVGS[RPS_LIST[(spinIdx + 1) % 3]], '선택 중...');
      }
    }, 95);

    choiceTimer = setInterval(() => {
      choiceLeft -= 1;
      ui.updateTimer(choiceLeft);
      if (choiceLeft <= 3 && choiceLeft > 0) window.BawiboAudio.tick();
      if (choiceLeft <= 0) {
        clearInterval(choiceTimer);
        choiceTimer = null;
        if (!roundResolved) {
          ui.disableRpsButtons(true);
          // Small grace window for in-flight peer message
          graceTimer = setTimeout(() => {
            if (!roundResolved) resolveRound();
          }, 700);
        }
      }
    }, 1000);
  }

  function selectChoice(choice) {
    if (state !== 'playing' || roundResolved || myChoice) return;
    window.BawiboAudio.click();
    myChoice = choice;
    ui.highlightSelectedChoice(choice);
    ui.disableRpsButtons(true);
    ui.setLeftDisplay(RPS_SVGS[choice], `${RPS_LABELS[choice]} (대기 중)`);

    sendRoomEvent({
      type: 'choice',
      fromClientId: clientId,
      fromPlayerId: playerId,
      roundId,
      choice
    });

    if (oppChoice !== null) {
      resolveRound();
    }
  }

  function resolveRound() {
    if (roundResolved) return;
    roundResolved = true;
    clearAllTimers();
    state = 'post_round';

    const timeoutSvg = `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" fill="#2b1929" stroke="#ff5c7a" stroke-width="4"/><text x="60" y="72" text-anchor="middle" font-size="40">⏰</text></svg>`;

    if (myChoice) {
      ui.setLeftDisplay(RPS_SVGS[myChoice], RPS_LABELS[myChoice]);
    } else {
      ui.setLeftDisplay(timeoutSvg, '시간 초과');
    }

    if (oppChoice) {
      ui.setRightDisplay(RPS_SVGS[oppChoice], RPS_LABELS[oppChoice]);
    } else {
      ui.setRightDisplay(timeoutSvg, '시간 초과');
    }

    ui.stopSpinning();

    const outcome = judgeRPS(myChoice, oppChoice);
    const updatedStats = window.BawiboStorage.recordResult(playerId, outcome);
    const recordLine = `${window.BawiboStorage.formatRecord(updatedStats)}`;

    if (outcome === 'win') {
      window.BawiboAudio.win();
      ui.setCardOutcomes('winner', 'loser');
      ui.showResult('win', '승리', `${updatedStats.currentMultiStreak}연승!`, recordLine);
    } else if (outcome === 'lose') {
      window.BawiboAudio.lose();
      ui.setCardOutcomes('loser', 'winner');
      ui.showResult('lose', '패배', '연승 초기화', recordLine);
    } else {
      window.BawiboAudio.draw();
      ui.setCardOutcomes('locked', 'locked');
      ui.showResult('draw', '무승부', `${updatedStats.currentMultiStreak}연승 유지`, recordLine);
    }

    updateGameHeader();
    startPostRoundMenu();
  }

  function startPostRoundMenu() {
    postLeft = 10;
    ui.showBottomMenu('multi-post');
    ui.updateMultiPostTimer(postLeft, false);

    postTimer = setInterval(() => {
      postLeft -= 1;
      ui.updateMultiPostTimer(postLeft, myRematchReady);
      if (postLeft <= 0) {
        clearInterval(postTimer);
        postTimer = null;
        startNextRound();
      }
    }, 1000);
  }

  function chooseRematch() {
    if (state !== 'post_round' || myRematchReady) return;
    window.BawiboAudio.click();
    myRematchReady = true;
    ui.updateMultiPostTimer(postLeft, true);
    sendRoomEvent({
      type: 'rematch_ready',
      fromClientId: clientId,
      fromPlayerId: playerId,
      roundId
    });
    if (oppRematchReady) {
      startNextRound();
    }
  }

  function chooseQuit() {
    if (state !== 'post_round') return;
    window.BawiboAudio.click();
    sendRoomEvent({
      type: 'quit_normal',
      fromClientId: clientId,
      fromPlayerId: playerId
    });
    cleanupRoomIfHost();
    returnToLobby();
  }

  function startNextRound() {
    if (state !== 'post_round') return;
    roundId += 1;
    startRound();
  }

  function exitMidGameByUser() {
    // Clicking '나가기' during an active game counts as leaving mid-game -> 1 loss for leaver, 1 win for peer
    if (state === 'playing' || state === 'post_round') {
      window.BawiboStorage.recordResult(playerId, 'lose');
      sendAbruptLeaveSync();
      ui.toast('게임 중 나가기로 1패가 기록되었습니다.', 'error');
      returnToLobby();
    } else if (state === 'room_waiting') {
      leaveWaitingRoom(false);
    }
  }

  return {
    init,
    enterLobby,
    leaveToMain,
    createRoom,
    joinRoom,
    renderRoomList,
    hostStartGame,
    leaveWaitingRoom,
    selectChoice,
    chooseRematch,
    chooseQuit,
    exitMidGameByUser
  };
})();
