# Arrow Puzzle Escape

A production-quality, offline-first HTML5 puzzle game. Tap arrows to clear
the board — but an arrow only escapes if its path to the edge is clear.
100 levels across 5 difficulty tiers, stars, combos, hints, achievements,
a daily challenge, and a global leaderboard.

No build step, no paid APIs, no frameworks. Pure HTML/CSS/vanilla JS.

## Quick start (local)

Any static file server works, e.g.:

```bash
cd arrow-puzzle-escape
python3 -m http.server 8080
# open http://localhost:8080
```

Opening `index.html` directly via `file://` mostly works too, except the
service worker (PWA install) requires `http(s)://` or `localhost`.

## Project structure

```
arrow-puzzle-escape/
├── index.html            # app shell + SEO/Open Graph metadata
├── manifest.json         # PWA manifest
├── service-worker.js     # offline app-shell caching
├── assets/
│   ├── icons/            # generated app icons (192/512)
│   ├── sounds/           # (empty — all SFX are synthesized, see js/audio.js)
│   └── images/
├── css/
│   ├── styles.css        # design system + layout
│   └── animations.css    # all keyframes, respects prefers-reduced-motion
├── js/
│   ├── storage.js        # LocalStorage schema + persistence
│   ├── levels.js         # procedural level generator, solver, validator
│   ├── audio.js          # Web Audio API SFX + generated ambient music
│   ├── score.js          # score + star calculation
│   ├── achievements.js   # achievement definitions + unlock checks
│   ├── dailyChallenge.js # date-seeded shared daily puzzle
│   ├── player.js         # username rules, profile summary, leaderboard sync
│   ├── game.js           # active session logic (framework-agnostic)
│   ├── ui.js             # screens, rendering, event handling
│   ├── app.js            # bootstrap + service worker registration
│   └── services/
│       └── leaderboard.js   # <-- swap backend here (mock ↔ Supabase)
└── README.md
```

## How the puzzle generator guarantees a solution

Every level is built **backwards**: starting from an empty board, arrows
are placed one at a time from the *last* one that will escape to the
*first*. At each step, a candidate cell/direction is only accepted if its
path to the edge is clear on the board as constructed so far. This makes
every generated puzzle solvable by construction — no rejection sampling
needed. `LevelEngine.solveLevel()` double-checks this with a greedy
solver (provably complete for this puzzle family, since removing an
arrow can only open up paths for others, never block them).

Levels 1–100 scale grid size (4×4 → 10×10) and arrow density (35% → 80%
fill) smoothly, and the same generator can produce level 500 or 5,000
just by calling `LevelEngine.buildLevel(n)` — the architecture already
supports unlimited levels.

## LocalStorage schema

Everything except the global leaderboard lives under one key,
`arrowEscapeGame`, as structured JSON (see `js/storage.js` for the full
shape): username, level progress, stars, score, settings, achievements,
statistics, and hint balance.

## Global leaderboard: mock mode vs. production

`js/services/leaderboard.js` is the **only** file that talks to a
backend. Right now `LEADERBOARD_CONFIG.backend = 'mock'`, which
simulates a shared server using a separate LocalStorage key (seeded with
seven sample players) plus a small artificial network delay — good
enough to build and demo the whole leaderboard UI before you have a real
backend.

### Going live with Supabase (recommended, free tier)

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run:

```sql
create table players (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  highest_level integer not null default 0,
  total_stars integer not null default 0,
  total_score integer not null default 0,
  completed_levels integer not null default 0,
  best_time_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index players_rank_idx
  on players (highest_level desc, total_stars desc, total_score desc, best_time_ms asc);

-- optional: per-level history for anti-cheat auditing / analytics
create table level_scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  level integer not null,
  score integer not null,
  stars integer not null,
  time_ms integer,
  moves integer,
  completed_at timestamptz not null default now()
);

alter table players enable row level security;
alter table level_scores enable row level security;

-- Anyone can read the leaderboard.
create policy "Public read access" on players
  for select using (true);

-- Anyone can insert/update a row for a username, but only their own —
-- this is a starting point; upgrade to Supabase Auth + `auth.uid()`-based
-- policies before shipping something that needs strong anti-cheat guarantees.
create policy "Insert own row" on players
  for insert with check (true);
create policy "Update own row" on players
  for update using (true);
```

3. In `js/services/leaderboard.js`, set:

```js
const LEADERBOARD_CONFIG = {
  backend: 'supabase',
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR-PUBLIC-ANON-KEY',
  ...
};
```

No other file needs to change — `UI`, `Player`, and `game.js` only ever
call the stable `LeaderboardService` interface.

### Anti-cheat notes (read before shipping for real)

The client currently sanitizes usernames and caps scores/stars against a
generous per-level ceiling before submitting (`validateSubmission()` in
`leaderboard.js`). **This is not real security** — a determined client
can call the API directly. For production:

- Require Supabase Auth (even anonymous auth) and scope RLS policies to
  `auth.uid()` instead of trusting the `username` field.
- Move score validation into a Postgres function / Edge Function that
  recomputes the maximum possible score for a level server-side, rather
  than trusting anything the client sends.
- Rate-limit submissions per user (e.g. one per level per few seconds).

The prototype ships with client-side checks only, documented here so
it's an explicit, known limitation rather than a silent gap.

## Offline-first behavior

Gameplay, progress, stats, and settings all work fully offline — the
service worker caches the entire app shell. Only two things need a
network connection: submitting to / reading the global leaderboard, and
nothing else. If a leaderboard call fails, the UI shows "Leaderboard
temporarily unavailable" and queues the submission to retry automatically
the next time the `online` event fires.

## Deployment (free)

**Frontend — pick one:**
- **Netlify**: drag-and-drop the `arrow-puzzle-escape` folder onto
  [app.netlify.com/drop](https://app.netlify.com/drop), or connect a git
  repo for CI deploys.
- **Vercel**: `vercel deploy` from inside the folder (no build command
  needed — it's static).
- **GitHub Pages**: push this folder to a repo, enable Pages on the
  `main` branch root (or `/docs`), done.

**Backend:** Supabase, as above (free tier is plenty for a small/medium
puzzle game's leaderboard traffic).

The game keeps working even if the backend is unreachable, so there's no
hard dependency between the two deploys — ship the frontend first, wire
up Supabase whenever you're ready.

## Publishing to game portals (GameDistribution, CrazyGames, itch.io, etc.)

This is a plain HTML5 game with no external paid dependencies, so it can
be zipped and uploaded to most HTML5 game portals as-is. Two things worth
checking per-portal before upload:
- Some portals sandbox the game in an iframe with no `localStorage`
  isolation guarantees — test that progress saves correctly once
  uploaded, since portal iframes can behave differently than a normal tab.
- Ad-supported portals often inject their own audio/video ads; keep
  `audioSystem.musicOn` toggle-able (it already is, in Settings) so
  players can mute the game's music around portal ads if needed.

## Known limitations of this prototype

- The Supabase backend is provided as ready-to-run SQL + code, but is
  disabled by default (`backend: 'mock'`) until you plug in your own
  project credentials.
- Anti-cheat is client-side-only sanity checking, not real security (see
  above) — fine for a casual free game, not for anything with real-money
  stakes.
- Sounds are fully synthesized (no external audio files) to avoid any
  licensing dependency; swap in your own royalty-free `.mp3`/`.ogg`
  files under `assets/sounds/` and wire them into `js/audio.js` if you
  want richer audio.
