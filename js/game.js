/**
 * game.js
 * Manages one active play session (a level or the daily challenge):
 * arrow state, move validation, combo/score/timer bookkeeping, hints.
 * Rendering and screen navigation live in ui.js — this file is UI-agnostic.
 */

class GameSession {
  constructor(level) {
    this.level = level;
    this.size = level.size;
    this.arrows = level.arrows.map(a => ({ ...a, escaped: false }));
    this.combo = 0;
    this.maxCombo = 0;
    this.score = 0;
    this.moves = 0;
    this.mistakes = 0;
    this.taps = 0;
    this.hintsUsed = 0;
    this.startedAt = Date.now();
    this.finishedAt = null;
    this.locked = false; // true while an escape animation plays
    this.onEscape = null;      // (arrow) => void
    this.onBlocked = null;     // (arrow) => void
    this.onCombo = null;       // (comboCount) => void
    this.onComplete = null;    // (result) => void
  }

  remainingCount() {
    return this.arrows.filter(a => !a.escaped).length;
  }

  canEscape(arrow) {
    if (arrow.escaped) return false;
    return LevelEngine.isPathClearAmong(this.arrows, arrow, this.size);
  }

  escapableArrows() {
    return this.arrows.filter(a => !a.escaped && this.canEscape(a));
  }

  /** Returns { success, arrow, levelComplete, result? } */
  attemptEscape(arrowId) {
    if (this.locked || this.finishedAt) return { success: false, reason: 'locked' };
    const arrow = this.arrows.find(a => a.id === arrowId);
    if (!arrow || arrow.escaped) return { success: false, reason: 'invalid' };

    this.taps++;

    if (!this.canEscape(arrow)) {
      this.combo = 0;
      this.mistakes++;
      if (this.onBlocked) this.onBlocked(arrow);
      return { success: false, reason: 'blocked', arrow };
    }

    arrow.escaped = true;
    this.moves++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (this.onEscape) this.onEscape(arrow);
    if (this.combo >= 2 && this.onCombo) this.onCombo(this.combo);

    const remaining = this.remainingCount();
    if (remaining === 0) {
      return { success: true, arrow, levelComplete: true, result: this.finish() };
    }
    return { success: true, arrow, levelComplete: false };
  }

  useHint() {
    if (this.finishedAt) return null;
    const options = this.escapableArrows();
    if (!options.length) return null;
    this.hintsUsed++;
    // Prefer a hint that isn't the most "obvious" edge arrow, for variety.
    const hinted = options[Math.floor(Math.random() * options.length)];
    return hinted;
  }

  finish() {
    this.finishedAt = Date.now();
    const timeMs = this.finishedAt - this.startedAt;
    const scoreCalc = ScoreEngine.computeFinalScore({
      level: this.level,
      timeMs,
      mistakes: this.mistakes,
      hintsUsed: this.hintsUsed,
      maxCombo: this.maxCombo
    });
    const stars = ScoreEngine.computeStars({
      level: this.level,
      timeMs,
      mistakes: this.mistakes,
      hintsUsed: this.hintsUsed,
      moves: this.moves
    });
    this.score = scoreCalc.finalScore;

    const result = {
      levelNumber: this.level.number,
      score: this.score,
      breakdown: scoreCalc.breakdown,
      stars,
      timeMs,
      moves: this.moves,
      mistakes: this.mistakes,
      hintsUsed: this.hintsUsed,
      combo: this.maxCombo,
      taps: this.taps
    };
    if (this.onComplete) this.onComplete(result);
    return result;
  }
}
