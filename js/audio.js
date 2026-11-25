/**
 * Lightweight Web Audio synthesizer for game sound effects.
 */
window.BawiboAudio = (() => {
  let ctx = null;
  let muted = false;

  function ensureCtx() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) ctx = new AudioCtx();
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function playTone(freq, duration, type = 'sine', volume = 0.14, delay = 0) {
    if (muted) return;
    const audio = ensureCtx();
    if (!audio) return;
    const startTime = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  return {
    isMuted: () => muted,
    toggleMute: () => {
      muted = !muted;
      return muted;
    },
    click: () => playTone(520, 0.06, 'triangle', 0.12),
    tick: () => playTone(680, 0.05, 'sine', 0.08),
    win: () => {
      playTone(523.25, 0.12, 'triangle', 0.16, 0);
      playTone(659.25, 0.12, 'triangle', 0.16, 0.1);
      playTone(783.99, 0.22, 'triangle', 0.18, 0.2);
    },
    draw: () => {
      playTone(440, 0.12, 'sine', 0.12, 0);
      playTone(440, 0.14, 'sine', 0.12, 0.14);
    },
    lose: () => {
      playTone(340, 0.15, 'sawtooth', 0.1, 0);
      playTone(260, 0.28, 'sawtooth', 0.1, 0.15);
    },
    champion: () => {
      const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
      notes.forEach((n, i) => playTone(n, i === notes.length - 1 ? 0.5 : 0.15, 'triangle', 0.2, i * 0.12));
    }
  };
})();
