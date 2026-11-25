/**
 * RPS SVG artwork and 15 distinct AI characters for Single Player 15-win streak.
 */
window.BawiboAssets = (() => {
  const RPS_LIST = ['scissors', 'rock', 'paper'];
  const RPS_LABELS = {
    scissors: '가위',
    rock: '바위',
    paper: '보'
  };

  const RPS_SVGS = {
    scissors: `
      <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="60" cy="60" r="54" fill="#233059" stroke="#5B7CFA" stroke-width="4"/>
        <g transform="translate(16,14)">
          <rect x="26" y="4" width="14" height="48" rx="7" transform="rotate(-14 33 28)" fill="#FFD8A8" stroke="#E67700" stroke-width="3"/>
          <rect x="46" y="4" width="14" height="48" rx="7" transform="rotate(14 53 28)" fill="#FFD8A8" stroke="#E67700" stroke-width="3"/>
          <rect x="22" y="44" width="44" height="36" rx="16" fill="#FFC078" stroke="#E67700" stroke-width="3"/>
          <rect x="22" y="50" width="16" height="16" rx="8" fill="#FFD8A8" stroke="#E67700" stroke-width="2.5"/>
          <rect x="50" y="50" width="16" height="16" rx="8" fill="#FFD8A8" stroke="#E67700" stroke-width="2.5"/>
        </g>
      </svg>
    `,
    rock: `
      <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="60" cy="60" r="54" fill="#233059" stroke="#FF6B6B" stroke-width="4"/>
        <g transform="translate(18,22)">
          <rect x="10" y="16" width="64" height="50" rx="22" fill="#FFC078" stroke="#E67700" stroke-width="3"/>
          <rect x="14" y="10" width="14" height="22" rx="7" fill="#FFD8A8" stroke="#E67700" stroke-width="2.5"/>
          <rect x="28" y="8" width="14" height="24" rx="7" fill="#FFD8A8" stroke="#E67700" stroke-width="2.5"/>
          <rect x="42" y="10" width="14" height="22" rx="7" fill="#FFD8A8" stroke="#E67700" stroke-width="2.5"/>
          <rect x="56" y="14" width="13" height="20" rx="6.5" fill="#FFD8A8" stroke="#E67700" stroke-width="2.5"/>
          <rect x="16" y="34" width="32" height="14" rx="7" fill="#FFE8CC" stroke="#E67700" stroke-width="2.5"/>
        </g>
      </svg>
    `,
    paper: `
      <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="60" cy="60" r="54" fill="#233059" stroke="#20C997" stroke-width="4"/>
        <g transform="translate(18,14)">
          <rect x="14" y="24" width="11" height="36" rx="5.5" transform="rotate(-12 19 42)" fill="#FFD8A8" stroke="#E67700" stroke-width="2.5"/>
          <rect x="27" y="10" width="12" height="44" rx="6" fill="#FFD8A8" stroke="#E67700" stroke-width="2.5"/>
          <rect x="40" y="6" width="12" height="48" rx="6" fill="#FFD8A8" stroke="#E67700" stroke-width="2.5"/>
          <rect x="53" y="12" width="12" height="42" rx="6" fill="#FFD8A8" stroke="#E67700" stroke-width="2.5"/>
          <rect x="65" y="28" width="11" height="30" rx="5.5" transform="rotate(14 70 43)" fill="#FFD8A8" stroke="#E67700" stroke-width="2.5"/>
          <rect x="20" y="46" width="46" height="36" rx="16" fill="#FFC078" stroke="#E67700" stroke-width="3"/>
        </g>
      </svg>
    `
  };

  function makeAvatarSvg(bg, ring, icon, aura = false) {
    return `
      <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="32" r="29" fill="${bg}" stroke="${ring}" stroke-width="${aura ? 4 : 3}"/>
        ${aura ? `<circle cx="32" cy="32" r="24" fill="none" stroke="#FFD43B" stroke-width="1.5" stroke-dasharray="4 3"/>` : ''}
        <text x="32" y="40" text-anchor="middle" font-size="26">${icon}</text>
      </svg>
    `;
  }

  // 15 unique AI characters progressing from neighborhood kid to supreme god of RPS
  const AI_CHARACTERS = [
    { stage: 1, name: '동네 꼬마 민수', title: '가위바위보 입문자', bg: '#2b3a67', ring: '#74c0fc', icon: '🧒', aura: false },
    { stage: 2, name: '반장 수진', title: '학급의 작은 승부사', bg: '#3b2f63', ring: '#b197fc', icon: '👧', aura: false },
    { stage: 3, name: 'PC방 죽돌이 철수', title: '광클의 달인', bg: '#1e4d4b', ring: '#38d9a9', icon: '🎧', aura: false },
    { stage: 4, name: '문방구 사장님', title: '20년 경력의 눈치왕', bg: '#4f3824', ring: '#ffa94d', icon: '🧔', aura: false },
    { stage: 5, name: '동호회 에이스 지훈', title: '지역 예선 우승자', bg: '#1f3b73', ring: '#4dabf7', icon: '🧢', aura: false },
    { stage: 6, name: '타짜 박씨', title: '손은 눈보다 빠르다', bg: '#4a1e3a', ring: '#f06595', icon: '🕶️', aura: false },
    { stage: 7, name: '심리학 박사 유진', title: '표정을 읽는 분석가', bg: '#283d3b', ring: '#63e6be', icon: '🧐', aura: false },
    { stage: 8, name: '도장 사범 강호', title: '백전백승의 승부사', bg: '#5c2b29', ring: '#ff8787', icon: '🥋', aura: false },
    { stage: 9, name: '은둔 고수 백운', title: '바람을 가르는 손', bg: '#2b4555', ring: '#99e9f2', icon: '🧙', aura: false },
    { stage: 10, name: '천하제일 검객 무영', title: '찰나의 승부사', bg: '#212529', ring: '#ced4da', icon: '🥷', aura: true },
    { stage: 11, name: '암흑가의 제왕 카이', title: '냉혹한 승부사', bg: '#2b193d', ring: '#da77f2', icon: '🦇', aura: true },
    { stage: 12, name: '전설의 도박사 루시퍼', title: '운명을 비트는 자', bg: '#4a1218', ring: '#ff4d6d', icon: '🎭', aura: true },
    { stage: 13, name: '시공의 현자 크로노스', title: '미래를 엿보는 자', bg: '#102a43', ring: '#48cae4', icon: '⏳', aura: true },
    { stage: 14, name: '태초의 수호자 아테나', title: '신계의 마지막 관문', bg: '#3d2c0f', ring: '#fcc419', icon: '⚔️', aura: true },
    { stage: 15, name: '가위바위보 절대신 제우스', title: '만물의 승부신', bg: '#3b1d0a', ring: '#ffd43b', icon: '⚡', aura: true }
  ].map(c => ({
    ...c,
    avatarSvg: makeAvatarSvg(c.bg, c.ring, c.icon, c.aura)
  }));

  function judgeRPS(myChoice, oppChoice) {
    if (!myChoice && !oppChoice) return 'draw';
    if (!myChoice) return 'lose';
    if (!oppChoice) return 'win';
    if (myChoice === oppChoice) return 'draw';
    if (
      (myChoice === 'scissors' && oppChoice === 'paper') ||
      (myChoice === 'rock' && oppChoice === 'scissors') ||
      (myChoice === 'paper' && oppChoice === 'rock')
    ) {
      return 'win';
    }
    return 'lose';
  }

  return {
    RPS_LIST,
    RPS_LABELS,
    RPS_SVGS,
    AI_CHARACTERS,
    judgeRPS
  };
})();
