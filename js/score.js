/**
 * score.js
 * Scoring, combo, and star-rating logic. Kept pure/stateless so it is
 * easy to test and reason about.
 */

const ScoreEngine = {
  BASE_SCORE: 1000,

  comboMultiplier(combo) {
    if (combo >= 10) return 2.0;
    if (combo >= 6) return 1.5;
    if (combo >= 3) return 1.2;
    return 1.0;
  },

  computeFinalScore({ level, timeMs, mistakes, hintsUsed, maxCombo }) {
    let score = this.BASE_SCORE;

    const timeRatio = level.targetTimeMs ? timeMs / level.targetTimeMs : 1;
    let timeBonus = 0;
    if (timeRatio <= 1) timeBonus = Math.round(500 * (1 - timeRatio));
    score += timeBonus;

    const perfect = mistakes === 0 && hintsUsed === 0;
    const perfectBonus = perfect ? 500 : 0;
    score += perfectBonus;

    const comboBonus = Math.round(Math.min(maxCombo, 15) * 30);
    score += comboBonus;

    const mistakePenalty = mistakes * 40;
    const hintPenalty = hintsUsed * 120;
    score = Math.max(0, score - mistakePenalty - hintPenalty);

    return {
      finalScore: Math.round(score),
      breakdown: { base: this.BASE_SCORE, timeBonus, perfectBonus, comboBonus, mistakePenalty, hintPenalty }
    };
  },

  computeStars({ level, timeMs, mistakes, hintsUsed, moves }) {
    const perfect = mistakes === 0 && hintsUsed === 0;
    const withinTarget = level.targetTimeMs ? timeMs <= level.targetTimeMs : true;
    const withinMoves = level.moveLimit ? moves <= level.moveLimit : true;

    if (perfect && withinTarget && withinMoves) return 3;
    if (hintsUsed === 0 && mistakes <= 2) return 2;
    return 1;
  }
};
