/**
 * dailyChallenge.js
 * One shared puzzle per calendar day (UTC date string), generated with a
 * deterministic seed so every player who opens the game on the same day
 * gets the identical board.
 */

const DailyChallenge = {
  todayKey() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  },

  getTodayLevel() {
    return LevelEngine.buildDailyChallenge(this.todayKey());
  },

  isCompletedToday() {
    return gameStorage.get('dailyChallenge.lastCompletedDate') === this.todayKey();
  },

  bestScoreToday() {
    const history = gameStorage.get('dailyChallenge.history') || {};
    return (history[this.todayKey()] && history[this.todayKey()].score) || 0;
  },

  recordCompletion(score) {
    const key = this.todayKey();
    const history = gameStorage.get('dailyChallenge.history') || {};
    const prevBest = (history[key] && history[key].score) || 0;
    history[key] = { score: Math.max(prevBest, score), completedAt: Date.now() };
    gameStorage.set('dailyChallenge.history', history);
    gameStorage.set('dailyChallenge.lastCompletedDate', key);
    if (score > gameStorage.get('dailyChallenge.bestScore')) {
      gameStorage.set('dailyChallenge.bestScore', score);
    }
    return this.currentStreak();
  },

  currentStreak() {
    const history = gameStorage.get('dailyChallenge.history') || {};
    let streak = 0;
    const d = new Date();
    for (;;) {
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      if (history[key]) { streak++; d.setUTCDate(d.getUTCDate() - 1); }
      else break;
    }
    return streak;
  }
};
