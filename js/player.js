/**
 * player.js
 * Player profile helpers: username rules, progress summary used across
 * screens, and pushing the player's latest stats to the leaderboard.
 */

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,16}$/;
const BLOCKED_WORDS = ['admin', 'moderator', 'fuck', 'shit', 'bitch', 'nigger', 'rape', 'porn'];

const Player = {
  isUsernameValid(name) {
    if (!USERNAME_PATTERN.test(name)) return { ok: false, reason: 'Use 3–16 letters, numbers, or underscores.' };
    const lower = name.toLowerCase();
    if (BLOCKED_WORDS.some(w => lower.includes(w))) return { ok: false, reason: 'That name isn\u2019t allowed. Please choose another.' };
    return { ok: true };
  },

  getUsername() { return gameStorage.get('username'); },

  setUsername(name) {
    const check = this.isUsernameValid(name);
    if (!check.ok) throw new Error(check.reason);
    gameStorage.set('username', name);
    return name;
  },

  avatarInitials(name) {
    const clean = (name || '??').replace(/[^a-zA-Z0-9]/g, '');
    return clean.slice(0, 2).toUpperCase() || '??';
  },

  summary() {
    const s = gameStorage.state;
    return {
      username: s.username,
      currentLevel: s.currentLevel,
      highestUnlockedLevel: s.highestUnlockedLevel,
      totalStars: s.totalStars,
      totalScore: s.totalScore,
      completedCount: Object.keys(s.completedLevels).length,
      hintsAvailable: s.hints.available
    };
  },

  async syncToLeaderboard() {
    const s = gameStorage.state;
    if (!s.username) return;
    const bestTimes = Object.values(s.completedLevels).map(l => l.bestTimeMs).filter(Boolean);
    const entry = {
      username: s.username,
      highest_level: Math.max(0, s.highestUnlockedLevel - 1),
      total_stars: s.totalStars,
      total_score: s.totalScore,
      completed_levels: Object.keys(s.completedLevels).length,
      best_time_ms: bestTimes.length ? Math.min(...bestTimes) : null
    };
    try {
      await LeaderboardService.submitScore(entry);
      return true;
    } catch (e) {
      return false;
    }
  },

  grantDailyHintIfEligible() {
    const today = new Date().toISOString().slice(0, 10);
    if (gameStorage.get('hints.lastDailyRewardDate') !== today) {
      gameStorage.set('hints.available', gameStorage.get('hints.available') + 1);
      gameStorage.set('hints.lastDailyRewardDate', today);
      return true;
    }
    return false;
  }
};
