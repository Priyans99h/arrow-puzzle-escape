/**
 * achievements.js
 * Achievement definitions and the logic that checks/unlocks them after
 * relevant game events. Returns newly unlocked achievements so the UI
 * can show a toast/animation.
 */

const ACHIEVEMENTS = [
  { id: 'first_escape', icon: '🏹', name: 'First Escape', desc: 'Complete Level 1.' },
  { id: 'combo_master', icon: '🔥', name: 'Combo Master', desc: 'Reach Combo x10.' },
  { id: 'perfectionist', icon: '⭐', name: 'Perfectionist', desc: 'Get 3 stars on 10 levels.' },
  { id: 'puzzle_veteran', icon: '🏆', name: 'Puzzle Veteran', desc: 'Complete 50 levels.' },
  { id: 'star_collector', icon: '💎', name: 'Star Collector', desc: 'Earn 100 stars.' },
  { id: 'speed_demon', icon: '⚡', name: 'Speed Demon', desc: 'Complete a level under target time.' },
  { id: 'arrow_legend', icon: '👑', name: 'Arrow Legend', desc: 'Complete Level 100.' },
  { id: 'no_hints_needed', icon: '🧠', name: 'Sharp Mind', desc: 'Complete 5 levels without using a hint.' },
  { id: 'daily_devotee', icon: '📅', name: 'Daily Devotee', desc: 'Complete 7 Daily Challenges.' }
];

const AchievementEngine = {
  list() { return ACHIEVEMENTS; },

  isUnlocked(id) {
    const a = gameStorage.get(`achievements.${id}`);
    return !!(a && a.unlocked);
  },

  checkAfterLevel({ levelNumber, stars, combo, hintsUsed, timeMs, targetTimeMs }) {
    const newlyUnlocked = [];
    const tryUnlock = (id) => { if (gameStorage.unlockAchievement(id)) newlyUnlocked.push(ACHIEVEMENTS.find(a => a.id === id)); };

    if (levelNumber === 1) tryUnlock('first_escape');
    if (combo >= 10) tryUnlock('combo_master');
    if (levelNumber === 100) tryUnlock('arrow_legend');
    if (targetTimeMs && timeMs <= targetTimeMs) tryUnlock('speed_demon');

    const completed = gameStorage.state.completedLevels;
    const threeStarCount = Object.values(completed).filter(l => l.stars === 3).length;
    if (threeStarCount >= 10) tryUnlock('perfectionist');

    const totalCompleted = Object.keys(completed).length;
    if (totalCompleted >= 50) tryUnlock('puzzle_veteran');

    if (gameStorage.state.totalStars >= 100) tryUnlock('star_collector');

    const noHintCount = Object.values(completed).filter(l => l.hintsUsed === 0).length;
    if (noHintCount >= 5) tryUnlock('no_hints_needed');

    return newlyUnlocked;
  },

  checkAfterDaily(streak) {
    const newlyUnlocked = [];
    if (streak >= 7 && gameStorage.unlockAchievement('daily_devotee')) {
      newlyUnlocked.push(ACHIEVEMENTS.find(a => a.id === 'daily_devotee'));
    }
    return newlyUnlocked;
  }
};
