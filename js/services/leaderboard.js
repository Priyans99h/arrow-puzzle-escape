/**
 * services/leaderboard.js
 *
 * Service-layer abstraction for the GLOBAL leaderboard. The rest of the
 * game only talks to `LeaderboardService`, never directly to a backend,
 * so you can swap "mock" for "supabase" (or Firebase, or your own API)
 * without touching any UI or game logic.
 *
 * ---------------------------------------------------------------------
 * HOW TO GO LIVE WITH SUPABASE (see README.md for full SQL schema):
 * 1. Create a free project at https://supabase.com
 * 2. Run the SQL in README.md to create the `players` table + RLS policies.
 * 3. Fill in LEADERBOARD_CONFIG.supabaseUrl / supabaseAnonKey below.
 * 4. Set LEADERBOARD_CONFIG.backend = 'supabase'.
 * That's it — no other file needs to change.
 * ---------------------------------------------------------------------
 *
 * SECURITY NOTE: the anon key is a PUBLIC client key by design (safe to
 * ship in frontend code) as long as Row Level Security policies only
 * allow each row to be edited by its owner. Never put a service-role key
 * in frontend code.
 */

const LEADERBOARD_CONFIG = {
  backend: 'mock',              // 'mock' | 'supabase'
  supabaseUrl: '',              // e.g. 'https://xxxxx.supabase.co'
  supabaseAnonKey: '',          // public anon key only
  mockNetworkDelayMs: 250,
  mockSimulatedFailureRate: 0   // set 0.1 during dev to test offline handling
};

// A believable seed of "other players" so the mock leaderboard feels alive
// during development, before a real backend is connected.
const MOCK_SEED_PLAYERS = [
  { username: 'ShadowX', highest_level: 87, total_stars: 247, total_score: 182450, best_time_ms: 1180000 },
  { username: 'ArrowMaster', highest_level: 84, total_stars: 239, total_score: 176320, best_time_ms: 1210000 },
  { username: 'Priyansh', highest_level: 81, total_stars: 231, total_score: 169850, best_time_ms: 1250000 },
  { username: 'PuzzleKing', highest_level: 78, total_stars: 220, total_score: 161240, best_time_ms: 1290000 },
  { username: 'NightRunner', highest_level: 63, total_stars: 178, total_score: 121500, best_time_ms: 1400000 },
  { username: 'ArrowPro', highest_level: 42, total_stars: 123, total_score: 84900, best_time_ms: 900000 },
  { username: 'PlayerX', highest_level: 43, total_stars: 128, total_score: 88700, best_time_ms: 910000 },
  { username: 'PuzzleGuy', highest_level: 41, total_stars: 119, total_score: 80100, best_time_ms: 890000 },
  { username: 'GridGhost', highest_level: 35, total_stars: 95, total_score: 63000, best_time_ms: 800000 },
  { username: 'EscapeArtist', highest_level: 22, total_stars: 58, total_score: 39000, best_time_ms: 500000 }
];

function rankSort(a, b) {
  if (b.highest_level !== a.highest_level) return b.highest_level - a.highest_level;
  if (b.total_stars !== a.total_stars) return b.total_stars - a.total_stars;
  if (b.total_score !== a.total_score) return b.total_score - a.total_score;
  return (a.best_time_ms || Infinity) - (b.best_time_ms || Infinity);
}

function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

/** ---- MOCK BACKEND (localStorage-simulated "server", dev only) ---- */
const MOCK_KEY = 'arrowEscapeMockLeaderboard';

const MockBackend = {
  _read() {
    try {
      const raw = window.localStorage.getItem(MOCK_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* fall through */ }
    const seeded = MOCK_SEED_PLAYERS.map(p => ({ ...p, completed_levels: p.highest_level, updated_at: Date.now() }));
    window.localStorage.setItem(MOCK_KEY, JSON.stringify(seeded));
    return seeded;
  },
  _write(data) {
    try { window.localStorage.setItem(MOCK_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  },

  async submitScore(entry) {
    await delay(LEADERBOARD_CONFIG.mockNetworkDelayMs);
    if (Math.random() < LEADERBOARD_CONFIG.mockSimulatedFailureRate) throw new Error('Simulated network failure');

    // --- Basic anti-cheat-style validation (see README for full notes) ---
    const clean = validateSubmission(entry);

    const data = this._read();
    const idx = data.findIndex(p => p.username === clean.username);
    if (idx >= 0) {
      // Only ever move stats forward — never let a client regress another submission.
      data[idx] = {
        ...data[idx],
        highest_level: Math.max(data[idx].highest_level, clean.highest_level),
        total_stars: Math.max(data[idx].total_stars, clean.total_stars),
        total_score: Math.max(data[idx].total_score, clean.total_score),
        completed_levels: Math.max(data[idx].completed_levels || 0, clean.completed_levels || 0),
        best_time_ms: clean.best_time_ms
          ? Math.min(data[idx].best_time_ms || Infinity, clean.best_time_ms)
          : data[idx].best_time_ms,
        updated_at: Date.now()
      };
    } else {
      data.push({ ...clean, updated_at: Date.now() });
    }
    this._write(data);
    return { ok: true };
  },

  async getGlobalLeaderboard(limit = 50) {
    await delay(LEADERBOARD_CONFIG.mockNetworkDelayMs);
    const data = [...this._read()].sort(rankSort);
    return data.slice(0, limit).map((p, i) => ({ ...p, rank: i + 1 }));
  },

  async getPlayerRankInfo(username) {
    await delay(LEADERBOARD_CONFIG.mockNetworkDelayMs);
    const data = [...this._read()].sort(rankSort);
    const idx = data.findIndex(p => p.username === username);
    return {
      rank: idx >= 0 ? idx + 1 : null,
      totalPlayers: data.length,
      nearby: idx >= 0 ? data.slice(Math.max(0, idx - 2), idx + 3).map((p) => ({ ...p, rank: data.indexOf(p) + 1 })) : [],
      percentile: idx >= 0 && data.length > 1 ? Math.round(((data.length - 1 - idx) / (data.length - 1)) * 100) : null,
      player: idx >= 0 ? data[idx] : null
    };
  }
};

/** ---- SUPABASE BACKEND (production-ready, disabled until configured) ---- */
const SupabaseBackend = {
  _headers() {
    return {
      'Content-Type': 'application/json',
      apikey: LEADERBOARD_CONFIG.supabaseAnonKey,
      Authorization: `Bearer ${LEADERBOARD_CONFIG.supabaseAnonKey}`
    };
  },
  _endpoint(path) { return `${LEADERBOARD_CONFIG.supabaseUrl}/rest/v1/${path}`; },

  async submitScore(entry) {
    const clean = validateSubmission(entry);
    // Upsert on username. Requires a UNIQUE constraint on players.username
    // and an RLS policy allowing insert/update only on matching rows.
    const res = await fetch(this._endpoint('players?on_conflict=username'), {
      method: 'POST',
      headers: { ...this._headers(), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{ ...clean, updated_at: new Date().toISOString() }])
    });
    if (!res.ok) throw new Error(`Leaderboard submit failed: ${res.status}`);
    return { ok: true };
  },

  async getGlobalLeaderboard(limit = 50) {
    const res = await fetch(
      this._endpoint(`players?select=*&order=highest_level.desc,total_stars.desc,total_score.desc,best_time_ms.asc&limit=${limit}`),
      { headers: this._headers() }
    );
    if (!res.ok) throw new Error(`Leaderboard fetch failed: ${res.status}`);
    const data = await res.json();
    return data.map((p, i) => ({ ...p, rank: i + 1 }));
  },

  async getPlayerRankInfo(username) {
    // For large tables, do this ranking in a Postgres function/view instead
    // of pulling everything client-side. Kept simple here for clarity.
    const all = await this.getGlobalLeaderboard(100000);
    const idx = all.findIndex(p => p.username === username);
    return {
      rank: idx >= 0 ? idx + 1 : null,
      totalPlayers: all.length,
      nearby: idx >= 0 ? all.slice(Math.max(0, idx - 2), idx + 3) : [],
      percentile: idx >= 0 && all.length > 1 ? Math.round(((all.length - 1 - idx) / (all.length - 1)) * 100) : null,
      player: idx >= 0 ? all[idx] : null
    };
  }
};

/** ---- Shared client-side sanity checks (real validation must happen server-side too) ---- */
function validateSubmission(entry) {
  const username = String(entry.username || '').trim().slice(0, 16).replace(/[^a-zA-Z0-9_]/g, '');
  if (username.length < 3) throw new Error('Invalid username for submission.');

  const highest_level = Math.max(0, Math.min(100, Math.round(entry.highest_level || 0)));
  // A generous per-level ceiling — real enforcement belongs in a DB trigger/edge function.
  const maxPossibleScore = highest_level * 2600;
  const total_score = Math.max(0, Math.min(maxPossibleScore, Math.round(entry.total_score || 0)));
  const total_stars = Math.max(0, Math.min(highest_level * 3, Math.round(entry.total_stars || 0)));
  const completed_levels = Math.max(0, Math.min(highest_level, Math.round(entry.completed_levels || 0)));

  return {
    username,
    highest_level,
    total_stars,
    total_score,
    completed_levels,
    best_time_ms: entry.best_time_ms || null
  };
}

const LeaderboardService = {
  config: LEADERBOARD_CONFIG,

  _backend() {
    return LEADERBOARD_CONFIG.backend === 'supabase' ? SupabaseBackend : MockBackend;
  },

  async submitScore(entry) {
    try {
      return await this._backend().submitScore(entry);
    } catch (e) {
      console.warn('Leaderboard submit failed, will retry when online.', e);
      this._queueRetry(entry);
      throw e;
    }
  },

  async getGlobalLeaderboard(limit) {
    return this._backend().getGlobalLeaderboard(limit);
  },

  async getPlayerRankInfo(username) {
    return this._backend().getPlayerRankInfo(username);
  },

  _queueRetry(entry) {
    try {
      const key = 'arrowEscapePendingSubmissions';
      const pending = JSON.parse(window.localStorage.getItem(key) || '[]');
      pending.push(entry);
      window.localStorage.setItem(key, JSON.stringify(pending));
    } catch (e) { /* ignore */ }
  },

  async flushPendingSubmissions() {
    const key = 'arrowEscapePendingSubmissions';
    let pending = [];
    try { pending = JSON.parse(window.localStorage.getItem(key) || '[]'); } catch (e) { /* ignore */ }
    if (!pending.length) return;
    const stillPending = [];
    for (const entry of pending) {
      try { await this.submitScore(entry); } catch (e) { stillPending.push(entry); }
    }
    try { window.localStorage.setItem(key, JSON.stringify(stillPending)); } catch (e) { /* ignore */ }
  }
};

window.addEventListener('online', () => LeaderboardService.flushPendingSubmissions());
