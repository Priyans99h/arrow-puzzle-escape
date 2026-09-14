/**
 * storage.js
 * Single source of truth for everything persisted in LocalStorage.
 * Never store the global leaderboard here — see services/leaderboard.js.
 */

const STORAGE_KEY = 'arrowEscapeGame';

const DEFAULT_STATE = {
  version: 1,
  username: null,
  currentLevel: 1,
  highestUnlockedLevel: 1,
  completedLevels: {},        // { [levelNumber]: { stars, bestScore, bestTimeMs, moves, hintsUsed } }
  totalStars: 0,
  totalScore: 0,
  lastPlayedLevel: null,
  settings: {
    sound: true,
    music: true,
    vibration: true,
    reducedMotion: false
  },
  achievements: {},           // { [id]: { unlocked: true, unlockedAt } }
  stats: {
    levelsCompleted: 0,
    totalStarsEarned: 0,
    totalScore: 0,
    highestCombo: 0,
    fastestLevelMs: null,
    hintsUsed: 0,
    totalPlayTimeMs: 0,
    totalMistakes: 0,
    totalTaps: 0
  },
  hints: {
    available: 3,
    lastDailyRewardDate: null
  },
  dailyChallenge: {
    lastCompletedDate: null,
    bestScore: 0,
    history: {}
  }
};

function deepMerge(base, incoming) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key in incoming) {
    if (incoming[key] && typeof incoming[key] === 'object' && !Array.isArray(incoming[key]) && base[key]) {
      out[key] = deepMerge(base[key], incoming[key]);
    } else {
      out[key] = incoming[key];
    }
  }
  return out;
}

class GameStorage {
  constructor() {
    this.available = this._checkAvailability();
    this.state = this._load();
  }

  _checkAvailability() {
    try {
      const testKey = '__arrowEscapeTest__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      console.warn('LocalStorage unavailable — progress will not be saved this session.', e);
      return false;
    }
  }

  _load() {
    if (!this.available) return JSON.parse(JSON.stringify(DEFAULT_STATE));
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
      const parsed = JSON.parse(raw);
      return deepMerge(DEFAULT_STATE, parsed);
    } catch (e) {
      console.warn('Save data was corrupted. Starting fresh.', e);
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  save() {
    if (!this.available) return false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      return true;
    } catch (e) {
      console.warn('Could not save progress.', e);
      return false;
    }
  }

  get(path) {
    return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), this.state);
  }

  set(path, value) {
    const keys = path.split('.');
    let obj = this.state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in obj)) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this.save();
  }

  reset() {
    this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    this.save();
  }

  recordLevelResult(levelNumber, result) {
    const existing = this.state.completedLevels[levelNumber];
    const isNew = !existing;
    const bestStars = Math.max(existing ? existing.stars : 0, result.stars);
    const bestScore = Math.max(existing ? existing.bestScore : 0, result.score);
    const bestTimeMs = existing && existing.bestTimeMs
      ? Math.min(existing.bestTimeMs, result.timeMs)
      : result.timeMs;

    if (isNew) this.state.totalStars += result.stars;
    else this.state.totalStars += Math.max(0, bestStars - existing.stars);

    this.state.totalScore += result.score;

    this.state.completedLevels[levelNumber] = {
      stars: bestStars,
      bestScore,
      bestTimeMs,
      moves: result.moves,
      hintsUsed: result.hintsUsed
    };

    if (levelNumber >= this.state.highestUnlockedLevel) {
      this.state.highestUnlockedLevel = Math.min(levelNumber + 1, 100);
    }

    this.state.stats.levelsCompleted = Object.keys(this.state.completedLevels).length;
    this.state.stats.totalStarsEarned = this.state.totalStars;
    this.state.stats.totalScore = this.state.totalScore;
    this.state.stats.hintsUsed += result.hintsUsed;
    this.state.stats.totalPlayTimeMs += result.timeMs;
    this.state.stats.totalMistakes += result.mistakes || 0;
    this.state.stats.totalTaps += result.taps || 0;
    if (result.combo > this.state.stats.highestCombo) this.state.stats.highestCombo = result.combo;
    if (this.state.stats.fastestLevelMs === null || result.timeMs < this.state.stats.fastestLevelMs) {
      this.state.stats.fastestLevelMs = result.timeMs;
    }

    this.save();
  }

  unlockAchievement(id) {
    if (this.state.achievements[id] && this.state.achievements[id].unlocked) return false;
    this.state.achievements[id] = { unlocked: true, unlockedAt: Date.now() };
    this.save();
    return true;
  }
}

const gameStorage = new GameStorage();
