/**
 * Player stats & session persistence in localStorage.
 */
window.BawiboStorage = (() => {
  const KEY_PREFIX = 'bawibo_stats_v1_';
  const LAST_ID_KEY = 'bawibo_last_player_id_v1';

  function getLastPlayerId() {
    return localStorage.getItem(LAST_ID_KEY) || '';
  }

  function setLastPlayerId(id) {
    if (id) localStorage.setItem(LAST_ID_KEY, id);
  }

  function getStats(playerId) {
    if (!playerId) return { wins: 0, losses: 0, draws: 0, bestStreak: 0, currentMultiStreak: 0 };
    try {
      const raw = localStorage.getItem(KEY_PREFIX + playerId);
      if (!raw) return { wins: 0, losses: 0, draws: 0, bestStreak: 0, currentMultiStreak: 0 };
      const parsed = JSON.parse(raw);
      return {
        wins: Number(parsed.wins) || 0,
        losses: Number(parsed.losses) || 0,
        draws: Number(parsed.draws) || 0,
        bestStreak: Number(parsed.bestStreak) || 0,
        currentMultiStreak: Number(parsed.currentMultiStreak) || 0
      };
    } catch {
      return { wins: 0, losses: 0, draws: 0, bestStreak: 0, currentMultiStreak: 0 };
    }
  }

  function saveStats(playerId, stats) {
    if (!playerId) return;
    localStorage.setItem(KEY_PREFIX + playerId, JSON.stringify(stats));
  }

  function recordResult(playerId, outcome, streakOverride = null) {
    const stats = getStats(playerId);
    if (outcome === 'win') {
      stats.wins += 1;
      stats.currentMultiStreak += 1;
      const streakToCheck = streakOverride !== null ? streakOverride : stats.currentMultiStreak;
      if (streakToCheck > stats.bestStreak) {
        stats.bestStreak = streakToCheck;
      }
    } else if (outcome === 'lose') {
      stats.losses += 1;
      stats.currentMultiStreak = 0;
    } else if (outcome === 'draw') {
      stats.draws += 1;
    }
    saveStats(playerId, stats);
    return stats;
  }

  function formatRecord(stats) {
    return `${stats.wins}승 ${stats.losses}패 ${stats.draws}무`;
  }

  return {
    getLastPlayerId,
    setLastPlayerId,
    getStats,
    saveStats,
    recordResult,
    formatRecord
  };
})();
