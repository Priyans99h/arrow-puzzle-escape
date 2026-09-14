/**
 * levels.js
 * Procedural level generator + validator + solver for Arrow Puzzle Escape.
 *
 * Puzzle rule: an arrow can escape only if every cell between it and the
 * board edge (in the direction it points) is empty.
 *
 * GENERATION STRATEGY
 * We build a level by constructing a guaranteed solve order in reverse:
 * start from an empty board and place arrows one at a time from the LAST
 * arrow to escape back to the FIRST. At each step the candidate cell/
 * direction must have a clear path on the board as it exists so far
 * (which only contains arrows that escape *after* this one). This makes
 * every generated puzzle solvable by construction.
 */

const DIRS = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 }
};
const DIR_LIST = Object.keys(DIRS);

// Deterministic PRNG (mulberry32) so daily challenges are reproducible.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

/** Path cells between (r,c) exclusive and the edge, in direction dir. */
function pathCells(r, c, dir, size) {
  const { dr, dc } = DIRS[dir];
  const cells = [];
  let nr = r + dr, nc = c + dc;
  while (nr >= 0 && nr < size && nc >= 0 && nc < size) {
    cells.push([nr, nc]);
    nr += dr; nc += dc;
  }
  return cells;
}

function isClear(board, r, c, dir) {
  const size = board.length;
  return pathCells(r, c, dir, size).every(([pr, pc]) => board[pr][pc] === null);
}

/** Every boundary-adjacent, outward-facing placement is always valid on an empty region. */
function outwardDirForEdge(r, c, size, rng) {
  const candidates = [];
  if (r === 0) candidates.push('up');
  if (r === size - 1) candidates.push('down');
  if (c === 0) candidates.push('left');
  if (c === size - 1) candidates.push('right');
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

/**
 * Generate a solvable level.
 * @param {number} size grid size (n x n)
 * @param {number} arrowCount number of arrows to place
 * @param {function} rng seeded random function (0..1)
 */
function generateBoard(size, arrowCount, rng) {
  const board = Array.from({ length: size }, () => Array(size).fill(null));
  const emptyCells = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) emptyCells.push([r, c]);

  const maxArrows = Math.min(arrowCount, size * size);
  const solveOrder = []; // order[0] = first arrow to escape

  // Fill from last-to-escape to first-to-escape.
  const placements = []; // will reverse at the end
  for (let i = 0; i < maxArrows; i++) {
    // shuffle remaining empty cells each attempt for variety
    let placed = false;
    const shuffled = [...emptyCells].sort(() => rng() - 0.5);

    for (const [r, c] of shuffled) {
      const dirsShuffled = [...DIR_LIST].sort(() => rng() - 0.5);
      for (const dir of dirsShuffled) {
        if (isClear(board, r, c, dir)) {
          board[r][c] = dir;
          placements.push({ r, c, dir });
          const idx = emptyCells.findIndex(([er, ec]) => er === r && ec === c);
          emptyCells.splice(idx, 1);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) break; // board saturated, stop early with fewer arrows
  }

  // placements[] was built last-to-escape first, so reverse for the actual solve order.
  const order = [...placements].reverse().map((p, idx) => ({ ...p, order: idx + 1 }));
  return { board, order };
}

/** Returns list of {r,c,dir} currently escapable on a board (arrows = {r,c,dir,id}). */
function findEscapable(arrows) {
  const escapable = [];
  for (const a of arrows) {
    if (a.escaped) continue;
    const blocked = arrows.some(other =>
      !other.escaped && other !== a &&
      pathCells(a.r, a.c, a.dir, Infinity === undefined ? 0 : arrowsBoardSize(arrows)).some(([pr, pc]) => pr === other.r && pc === other.c)
    );
    if (!blocked) escapable.push(a);
  }
  return escapable;
}

function arrowsBoardSize(arrows) {
  let max = 0;
  arrows.forEach(a => { max = Math.max(max, a.r, a.c); });
  return max + 1;
}

/** Greedy solver — correct & complete for this puzzle family (removals never block future moves). */
function solveLevel(levelArrows, size) {
  const arrows = levelArrows.map(a => ({ ...a, escaped: false }));
  const solveSequence = [];
  let progress = true;
  while (progress) {
    progress = false;
    for (const a of arrows) {
      if (a.escaped) continue;
      if (isPathClearAmong(arrows, a, size)) {
        a.escaped = true;
        solveSequence.push(a.id);
        progress = true;
      }
    }
  }
  const remaining = arrows.filter(a => !a.escaped).length;
  return { solvable: remaining === 0, solveSequence, remaining };
}

function isPathClearAmong(arrows, arrow, size) {
  const cells = pathCells(arrow.r, arrow.c, arrow.dir, size);
  return cells.every(([pr, pc]) => !arrows.some(o => !o.escaped && o !== arrow && o.r === pr && o.c === pc));
}

function validateLevel(levelArrows, size) {
  const { solvable } = solveLevel(levelArrows, size);
  return solvable;
}

// ---- Difficulty curve -------------------------------------------------

function difficultyForLevel(n) {
  if (n <= 10) return 'beginner';
  if (n <= 25) return 'easy';
  if (n <= 50) return 'medium';
  if (n <= 75) return 'hard';
  return 'expert';
}

function paramsForLevel(n) {
  // Grid grows 4x4 -> 10x10, arrow count scales with difficulty & density.
  const t = (n - 1) / 99; // 0..1
  const size = Math.round(4 + t * 6); // 4..10
  const maxCells = size * size;
  const density = 0.35 + t * 0.45; // 35% -> 80% fill
  const arrowCount = Math.max(4, Math.min(maxCells - 2, Math.round(maxCells * density)));
  const moveLimit = Math.round(arrowCount * (1.6 - t * 0.3));
  const targetTimeMs = Math.round((size * size * 900) * (1 - t * 0.25));
  const targetScore = 1000 + Math.round(n * 15);
  return { size, arrowCount, moveLimit, targetTimeMs, targetScore, difficulty: difficultyForLevel(n) };
}

/**
 * Build a full level object for level number `n`.
 * `seedOverride` lets the Daily Challenge request a date-based deterministic puzzle.
 */
function buildLevel(n, seedOverride) {
  const params = paramsForLevel(n);
  const seed = seedOverride !== undefined ? seedOverride : hashStringToSeed(`arrow-escape-v1-level-${n}`);
  const rng = mulberry32(seed);

  let attempt = 0;
  let board, order;
  do {
    ({ board, order } = generateBoard(params.size, params.arrowCount, mulberry32(seed + attempt * 7919)));
    attempt++;
  } while (order.length < Math.max(4, Math.floor(params.arrowCount * 0.6)) && attempt < 5);

  const arrows = order.map((p, idx) => ({
    id: `a${idx}`,
    r: p.r,
    c: p.c,
    dir: p.dir
  }));

  const check = solveLevel(arrows, params.size);

  return {
    number: n,
    size: params.size,
    arrowCount: arrows.length,
    difficulty: params.difficulty,
    moveLimit: params.moveLimit,
    targetTimeMs: params.targetTimeMs,
    targetScore: params.targetScore,
    arrows,
    solvable: check.solvable
  };
}

/** Deterministic puzzle for today's Daily Challenge, shared by all players. */
function buildDailyChallenge(dateStr) {
  const seed = hashStringToSeed(`arrow-escape-daily-${dateStr}`);
  const params = { size: 7, arrowCount: 24 };
  let board, order, attempt = 0;
  do {
    ({ board, order } = generateBoard(params.size, params.arrowCount, mulberry32(seed + attempt * 104729)));
    attempt++;
  } while (order.length < 18 && attempt < 5);

  const arrows = order.map((p, idx) => ({ id: `d${idx}`, r: p.r, c: p.c, dir: p.dir }));
  return {
    number: 'daily',
    date: dateStr,
    size: params.size,
    arrowCount: arrows.length,
    difficulty: 'daily',
    moveLimit: Math.round(arrows.length * 1.4),
    targetTimeMs: arrows.length * 1100,
    targetScore: 1500,
    arrows
  };
}

const LevelEngine = {
  buildLevel,
  buildDailyChallenge,
  validateLevel,
  solveLevel,
  paramsForLevel,
  difficultyForLevel,
  pathCells,
  isPathClearAmong,
  TOTAL_LEVELS: 100
};
