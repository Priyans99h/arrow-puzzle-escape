/**
 * ui.js
 * Screen rendering + event wiring. Talks to GameSession / LevelEngine /
 * ScoreEngine / storage / audio / leaderboard, but owns all DOM work.
 * A single #app root is re-rendered per screen; the board itself uses
 * incremental DOM updates (see renderBoardCells/updateArrowCell) so we
 * don't rebuild the whole grid on every tap.
 */

const ARROW_GLYPH = { up: '↑', down: '↓', left: '←', right: '→' };

const UI = {
  screen: 'BOOT',
  session: null,
  isDaily: false,
  root: null,
  hintedArrowId: null,
  pauseStartedAt: null,

  init() {
    this.root = document.getElementById('app');
    document.addEventListener('click', (e) => this.handleClick(e));
    document.addEventListener('keydown', (e) => this.handleKeydown(e));
    this.boot();
  },

  boot() {
    if (!gameStorage.get('username')) {
      this.render('USERNAME_ENTRY');
    } else {
      Player.grantDailyHintIfEligible();
      const last = gameStorage.get('lastPlayedLevel');
      if (last && !gameStorage.state.completedLevels[last]) {
        this.render('CONTINUE_PROMPT');
      } else {
        this.render('MENU');
      }
    }
    LeaderboardService.flushPendingSubmissions();
  },

  // ---------------------------------------------------------------- utils
  go(screen, opts) { audioSystem.transition(); this.render(screen, opts); },

  fmtTime(ms) {
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },

  /** Unified visual-only error state — shake + red border, used everywhere. */
  flashError(el) {
    if (!el) return;
    el.classList.remove('error-flash');
    // force reflow so the animation restarts if it's already mid-flash
    void el.offsetWidth;
    el.classList.add('error-flash');
    setTimeout(() => el.classList.remove('error-flash'), 400);
  },

  toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast--in'));
    setTimeout(() => { el.classList.remove('toast--in'); setTimeout(() => el.remove(), 300); }, 2200);
  },

  achievementToast(a) {
    const el = document.createElement('div');
    el.className = 'ach-toast';
    el.innerHTML = `<span class="ach-toast__icon">${a.icon}</span><div><div class="ach-toast__title">Achievement Unlocked</div><div class="ach-toast__name">${a.name}</div></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('ach-toast--in'));
    audioSystem.unlock();
    setTimeout(() => { el.classList.remove('ach-toast--in'); setTimeout(() => el.remove(), 400); }, 3200);
  },

  // ------------------------------------------------------------- routing
  render(screen, opts = {}) {
    this.screen = screen;
    this.root.setAttribute('data-screen', screen);
    switch (screen) {
      case 'USERNAME_ENTRY': return this.renderUsernameEntry();
      case 'CONTINUE_PROMPT': return this.renderContinuePrompt();
      case 'MENU': return this.renderMenu();
      case 'LEVEL_SELECT': return this.renderLevelSelect();
      case 'PLAYING': return this.renderPlaying(opts.levelNumber, opts.daily);
      case 'PAUSED': return this.renderPaused();
      case 'LEVEL_COMPLETE': return this.renderLevelComplete(opts.result);
      case 'SETTINGS': return this.renderSettings();
      case 'LEADERBOARD': return this.renderLeaderboard();
      case 'ACHIEVEMENTS': return this.renderAchievements();
      case 'STATS': return this.renderStats();
      case 'DAILY_INTRO': return this.renderDailyIntro();
      default: return this.renderMenu();
    }
  },

  handleKeydown(e) {
    if (this.screen === 'PLAYING' && e.key === 'Escape') this.pauseGame();
  },

  handleClick(e) {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.getAttribute('data-action');
    audioSystem.click();
    switch (action) {
      case 'goto': return this.go(actionEl.getAttribute('data-target'));
      case 'play': return this.go('LEVEL_SELECT');
      case 'play-level': return this.go('PLAYING', { levelNumber: Number(actionEl.getAttribute('data-level')) });
      case 'play-daily': return this.go('PLAYING', { daily: true });
      case 'daily-intro': return this.go('DAILY_INTRO');
      case 'save-username': return this.submitUsername();
      case 'continue-level': return this.go('PLAYING', { levelNumber: gameStorage.get('lastPlayedLevel') });
      case 'restart-level': return this.restartLevel();
      case 'pause': return this.pauseGame();
      case 'resume': return this.resumeGame();
      case 'quit-to-menu': return this.go('MENU');
      case 'quit-to-levels': return this.go('LEVEL_SELECT');
      case 'hint': return this.useHint();
      case 'next-level': return this.goNextLevel();
      case 'replay-level': return this.go('PLAYING', { levelNumber: this.session.level.number, daily: this.isDaily });
      case 'toggle-setting': return this.toggleSetting(actionEl.getAttribute('data-key'));
      case 'change-username': return this.render('USERNAME_ENTRY');
      case 'reset-progress': return this.confirmReset();
      case 'arrow-tap': return this.handleArrowTap(actionEl);
      default: return;
    }
  },

  // ------------------------------------------------------------ screens

  renderUsernameEntry() {
    const existing = gameStorage.get('username') || '';
    this.root.innerHTML = `
      <div class="screen screen--center fade-in">
        <div class="logo-block">
          <div class="logo-icon">➤</div>
          <h1 class="logo-title">ARROW PUZZLE<br><span>ESCAPE</span></h1>
        </div>
        <p class="subtitle">Choose your player name</p>
        <input id="username-input" class="text-input" maxlength="16" placeholder="e.g. ArrowMaster" value="${existing}" autocomplete="off" />
        <p id="username-error" class="error-text"></p>
        <button class="btn btn--primary btn--lg" data-action="save-username">CONTINUE</button>
        <p class="hint-text">3–16 characters · letters, numbers, underscore</p>
      </div>`;
    const input = document.getElementById('username-input');
    input.focus();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.submitUsername(); });
  },

  submitUsername() {
    const input = document.getElementById('username-input');
    const errorEl = document.getElementById('username-error');
    try {
      Player.setUsername(input.value.trim());
      audioSystem.unlock();
      this.go('MENU');
      Player.syncToLeaderboard();
    } catch (e) {
      errorEl.textContent = e.message;
      this.flashError(input);
    }
  },

  renderContinuePrompt() {
    const lvl = gameStorage.get('lastPlayedLevel');
    this.root.innerHTML = `
      <div class="screen screen--center fade-in">
        <div class="logo-block logo-block--sm">
          <div class="logo-icon">➤</div>
          <h1 class="logo-title logo-title--sm">ARROW PUZZLE ESCAPE</h1>
        </div>
        <p class="subtitle">Continue Level ${lvl}?</p>
        <button class="btn btn--primary btn--lg" data-action="continue-level">CONTINUE</button>
        <button class="btn btn--ghost" data-action="goto" data-target="LEVEL_SELECT">LEVELS</button>
      </div>`;
  },

  renderMenu() {
    const s = Player.summary();
    const dailyDone = DailyChallenge.isCompletedToday();
    this.root.innerHTML = `
      <div class="screen screen--menu fade-in">
        <div class="menu-top">
          <div class="profile-chip">
            <span class="avatar">${Player.avatarInitials(s.username)}</span>
            <span>${s.username}</span>
          </div>
          <div class="star-chip" aria-label="${s.totalStars} stars">
            <span class="star-chip__icon" aria-hidden="true">⭐</span>
            <span class="star-chip__count">${s.totalStars}</span>
          </div>
        </div>
        <div class="logo-block">
          <div class="logo-icon">➤</div>
          <h1 class="logo-title">ARROW PUZZLE<br><span>ESCAPE</span></h1>
        </div>
        <div class="menu-buttons">
          <button class="btn btn--primary btn--lg" data-action="play">▶ PLAY</button>
          <button class="btn btn--daily" data-action="daily-intro">
            🔥 DAILY CHALLENGE ${dailyDone ? '<span class="chip-done">DONE</span>' : ''}
          </button>
          <button class="btn btn--secondary" data-action="goto" data-target="LEADERBOARD">🏆 LEADERBOARD</button>
          <button class="btn btn--secondary" data-action="goto" data-target="LEVEL_SELECT">🎯 LEVELS</button>
          <button class="btn btn--secondary" data-action="goto" data-target="ACHIEVEMENTS">🏅 ACHIEVEMENTS</button>
          <button class="btn btn--secondary" data-action="goto" data-target="STATS">📊 STATISTICS</button>
          <button class="btn btn--ghost" data-action="goto" data-target="SETTINGS">⚙ SETTINGS</button>
        </div>
      </div>`;
  },

  renderDailyIntro() {
    const best = DailyChallenge.bestScoreToday();
    const done = DailyChallenge.isCompletedToday();
    this.root.innerHTML = `
      <div class="screen screen--center fade-in">
        <h2 class="section-title">🔥 Today's Puzzle</h2>
        <p class="subtitle">Everyone plays the same board today. Can you beat it?</p>
        <div class="stat-card-row">
          <div class="stat-card"><div class="stat-card__label">Best Score</div><div class="stat-card__value">${best.toLocaleString()}</div></div>
          <div class="stat-card"><div class="stat-card__label">Status</div><div class="stat-card__value">${done ? '✅ Done' : '—'}</div></div>
        </div>
        <button class="btn btn--primary btn--lg" data-action="play-daily">${done ? 'PLAY AGAIN' : 'START'}</button>
        <button class="btn btn--ghost" data-action="goto" data-target="MENU">BACK</button>
      </div>`;
  },

  renderLevelSelect() {
    const completed = gameStorage.state.completedLevels;
    const highest = gameStorage.get('highestUnlockedLevel');
    const cards = [];
    for (let n = 1; n <= LevelEngine.TOTAL_LEVELS; n++) {
      const locked = n > highest;
      const c = completed[n];
      const stars = c ? c.stars : 0;
      cards.push(`
        <button class="level-card ${locked ? 'level-card--locked' : ''} ${n === highest ? 'level-card--current' : ''}"
          ${locked ? 'disabled' : `data-action="play-level" data-level="${n}"`}>
          <div class="level-card__num">${n}</div>
          ${locked
            ? '<div class="level-card__lock">🔒</div>'
            : `<div class="level-card__stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>`}
          ${c ? `<div class="level-card__score">${c.bestScore.toLocaleString()}</div>` : ''}
        </button>`);
    }
    this.root.innerHTML = `
      <div class="screen fade-in">
        <div class="top-bar">
          <button class="icon-btn" data-action="goto" data-target="MENU">←</button>
          <h2 class="top-bar__title">LEVELS</h2>
          <span></span>
        </div>
        <div class="level-grid">${cards.join('')}</div>
      </div>`;
    const currentCard = this.root.querySelector('.level-card--current');
    if (currentCard) currentCard.scrollIntoView({ block: 'center' });
  },

  // ------------------------------------------------------------- gameplay

  renderPlaying(levelNumber, daily) {
    this.isDaily = !!daily;
    const level = daily ? DailyChallenge.getTodayLevel() : LevelEngine.buildLevel(levelNumber);
    gameStorage.set('lastPlayedLevel', level.number === 'daily' ? gameStorage.get('lastPlayedLevel') : level.number);
    this.session = new GameSession(level);
    this.hintedArrowId = null;

    const best = daily ? null : gameStorage.state.completedLevels[levelNumber];

    this.root.innerHTML = `
      <div class="screen screen--game fade-in">
        <div class="game-top">
          <button class="icon-btn" data-action="pause" aria-label="Pause">⏸</button>
          <div class="game-top__center">
            <div class="game-top__level">${daily ? 'DAILY CHALLENGE' : 'LEVEL ' + level.number}</div>
            <div class="game-top__stars" id="target-stars">${best ? '⭐'.repeat(best.stars) + '☆'.repeat(3 - best.stars) : '☆☆☆'}</div>
          </div>
          <div class="game-top__timer" id="game-timer">00:00</div>
        </div>
        <div class="game-hud">
          <div class="hud-chip" id="hud-score">SCORE <strong>0</strong></div>
          <div class="hud-combo" id="hud-combo"></div>
          <div class="hud-chip" id="hud-remaining"><strong>${level.arrowCount}</strong> left</div>
        </div>
        <div class="board-wrap">
          <div class="game-board" id="game-board" style="--grid-size:${level.size}"></div>
        </div>
        <div class="game-bottom">
          <button class="btn btn--pill" data-action="hint">💡 HINT (<span id="hint-count">${gameStorage.get('hints.available')}</span>)</button>
          <button class="btn btn--pill" data-action="restart-level">↻ RESTART</button>
          <button class="btn btn--pill" data-action="pause">⚙ PAUSE</button>
        </div>
      </div>`;

    this.renderBoardCells();
    this.wireSession();
    this.startTimer();
  },

  renderBoardCells() {
    const board = document.getElementById('game-board');
    const size = this.session.size;
    board.innerHTML = '';
    const grid = Array.from({ length: size }, () => Array(size).fill(null));
    this.session.arrows.forEach(a => { grid[a.r][a.c] = a; });

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const a = grid[r][c];
        const cell = document.createElement('div');
        cell.className = 'cell';
        if (a) {
          cell.classList.add('cell--arrow');
          cell.dataset.action = 'arrow-tap';
          cell.dataset.arrowId = a.id;
          cell.setAttribute('role', 'button');
          cell.setAttribute('tabindex', '0');
          cell.setAttribute('aria-label', `Arrow pointing ${a.dir}`);
          cell.innerHTML = `<span class="arrow-glyph arrow-glyph--${a.dir}">${ARROW_GLYPH[a.dir]}</span>`;
        }
        board.appendChild(cell);
      }
    }
  },

  wireSession() {
    const s = this.session;
    s.onEscape = (arrow) => {
      audioSystem.escape();
      const cell = this.root.querySelector(`[data-arrow-id="${arrow.id}"]`);
      if (cell) {
        const board = document.getElementById('game-board');
        const glyph = cell.querySelector('.arrow-glyph');
        if (board && glyph) {
          const boardRect = board.getBoundingClientRect();
          const cellRect = cell.getBoundingClientRect();
          const glyphRect = glyph.getBoundingClientRect();
          const edgePadding = 16;
          const distance = {
            up: cellRect.top - boardRect.top + glyphRect.height + edgePadding,
            down: boardRect.bottom - cellRect.bottom + glyphRect.height + edgePadding,
            left: cellRect.left - boardRect.left + glyphRect.width + edgePadding,
            right: boardRect.right - cellRect.right + glyphRect.width + edgePadding
          }[arrow.dir];
          cell.style.setProperty('--escape-distance', `${distance}px`);
        }
        cell.classList.add('cell--escaping', `cell--escaping-${arrow.dir}`);
        setTimeout(() => { cell.classList.add('cell--gone'); }, 650);
      }
      const remainingEl = document.getElementById('hud-remaining');
      if (remainingEl) remainingEl.innerHTML = `<strong>${s.remainingCount()}</strong> left`;
      const scoreEl = document.getElementById('hud-score');
      if (scoreEl) scoreEl.innerHTML = `SCORE <strong>${this.liveScoreEstimate()}</strong>`;
      if (this.hintedArrowId === arrow.id) this.hintedArrowId = null;
    };
    s.onBlocked = (arrow) => {
      audioSystem.blocked();
      const cell = this.root.querySelector(`[data-arrow-id="${arrow.id}"]`);
      if (cell) {
        cell.classList.remove('cell--blocked');
        void cell.offsetWidth;
        cell.classList.add('cell--blocked');
        setTimeout(() => cell.classList.remove('cell--blocked'), 360);
      }
      const comboEl = document.getElementById('hud-combo');
      if (comboEl) comboEl.innerHTML = '';
    };
    s.onCombo = (combo) => {
      audioSystem.combo(combo);
      const comboEl = document.getElementById('hud-combo');
      if (comboEl) {
        comboEl.innerHTML = `<span class="combo-badge combo-pop">🔥 COMBO x${combo}</span>`;
      }
    };
    s.onComplete = (result) => setTimeout(() => this.finishLevel(result), 680);
  },

  liveScoreEstimate() {
    const s = this.session;
    return ScoreEngine.BASE_SCORE + s.moves * 20 + s.maxCombo * 15 - s.mistakes * 40 - s.hintsUsed * 120;
  },

  startTimer() {
    this.timerInterval && clearInterval(this.timerInterval);
    const timerEl = document.getElementById('game-timer');
    if (!timerEl) return;
    this.timerInterval = setInterval(() => {
      if (!this.session || this.session.finishedAt) return;
      if (this.screen !== 'PLAYING') return;
      timerEl.textContent = this.fmtTime(Date.now() - this.session.startedAt);
    }, 250);
  },

  handleArrowTap(cellEl) {
    if (this.screen !== 'PLAYING' || !this.session) return;
    const arrowId = cellEl.dataset.arrowId;
    this.session.attemptEscape(arrowId);
  },

  useHint() {
    if (!this.session) return;
    const hintBtn = this.root.querySelector('[data-action="hint"]');
    if (gameStorage.get('hints.available') <= 0) {
      this.flashError(hintBtn);
      return;
    }
    const hinted = this.session.useHint();
    if (!hinted) { this.flashError(hintBtn); return; }
    gameStorage.set('hints.available', gameStorage.get('hints.available') - 1);
    const hintCountEl = document.getElementById('hint-count');
    if (hintCountEl) hintCountEl.textContent = gameStorage.get('hints.available');
    audioSystem.hint();
    const cell = this.root.querySelector(`[data-arrow-id="${hinted.id}"]`);
    if (cell) {
      cell.classList.add('cell--hint');
      setTimeout(() => cell.classList.remove('cell--hint'), 1600);
    }
  },

  restartLevel() {
    clearInterval(this.timerInterval);
    audioSystem.reset();
    this.renderPlaying(this.session.level.number === 'daily' ? undefined : this.session.level.number, this.isDaily);
  },

  pauseGame() {
    if (this.screen !== 'PLAYING') return;
    clearInterval(this.timerInterval);
    this.pauseStartedAt = Date.now();
    this.go('PAUSED');
  },

  resumeGame() {
    if (this.pauseStartedAt && this.session) {
      const pausedMs = Date.now() - this.pauseStartedAt;
      this.session.startedAt += pausedMs;
    }
    this.screen = 'PLAYING';
    this.root.setAttribute('data-screen', 'PLAYING');
    this.renderPlayingResume();
    this.startTimer();
  },

  renderPlayingResume() {
    // Re-render the persisted game HTML rather than rebuilding a new level.
    const level = this.session.level;
    const best = level.number === 'daily' ? null : gameStorage.state.completedLevels[level.number];
    this.root.innerHTML = `
      <div class="screen screen--game fade-in">
        <div class="game-top">
          <button class="icon-btn" data-action="pause" aria-label="Pause">⏸</button>
          <div class="game-top__center">
            <div class="game-top__level">${level.number === 'daily' ? 'DAILY CHALLENGE' : 'LEVEL ' + level.number}</div>
            <div class="game-top__stars" id="target-stars">${best ? '⭐'.repeat(best.stars) + '☆'.repeat(3 - best.stars) : '☆☆☆'}</div>
          </div>
          <div class="game-top__timer" id="game-timer">${this.fmtTime(Date.now() - this.session.startedAt)}</div>
        </div>
        <div class="game-hud">
          <div class="hud-chip" id="hud-score">SCORE <strong>${this.liveScoreEstimate()}</strong></div>
          <div class="hud-combo" id="hud-combo"></div>
          <div class="hud-chip" id="hud-remaining"><strong>${this.session.remainingCount()}</strong> left</div>
        </div>
        <div class="board-wrap">
          <div class="game-board" id="game-board" style="--grid-size:${level.size}"></div>
        </div>
        <div class="game-bottom">
          <button class="btn btn--pill" data-action="hint">💡 HINT (<span id="hint-count">${gameStorage.get('hints.available')}</span>)</button>
          <button class="btn btn--pill" data-action="restart-level">↻ RESTART</button>
          <button class="btn btn--pill" data-action="pause">⚙ PAUSE</button>
        </div>
      </div>`;
    this.renderBoardCells();
    // re-attach glyph state for already-escaped arrows
    this.session.arrows.filter(a => a.escaped).forEach(a => {
      const cell = this.root.querySelector(`[data-arrow-id="${a.id}"]`);
      if (cell) cell.classList.add('cell--gone');
    });
  },

  renderPaused() {
    this.root.innerHTML = `
      <div class="screen screen--center fade-in overlay">
        <h2 class="section-title">⏸ PAUSED</h2>
        <button class="btn btn--primary btn--lg" data-action="resume">RESUME</button>
        <button class="btn btn--ghost" data-action="restart-level">RESTART</button>
        <button class="btn btn--ghost" data-action="quit-to-levels">QUIT TO LEVELS</button>
      </div>`;
  },

  finishLevel(result) {
    clearInterval(this.timerInterval);
    audioSystem.levelComplete();
    if (result.stars === 3) setTimeout(() => audioSystem.threeStars(), 350);

    if (this.isDaily) {
      const streak = DailyChallenge.recordCompletion(result.score);
      AchievementEngine.checkAfterDaily(streak).forEach(a => setTimeout(() => this.achievementToast(a), 600));
    } else {
      const wasAlreadyDone = !!gameStorage.state.completedLevels[result.levelNumber];
      gameStorage.recordLevelResult(result.levelNumber, result);
      if (!wasAlreadyDone) audioSystem.unlock();
      AchievementEngine.checkAfterLevel({
        levelNumber: result.levelNumber,
        stars: result.stars,
        combo: result.combo,
        hintsUsed: result.hintsUsed,
        timeMs: result.timeMs,
        targetTimeMs: this.session.level.targetTimeMs
      }).forEach(a => setTimeout(() => this.achievementToast(a), 600));
      Player.syncToLeaderboard();
    }

    this.go('LEVEL_COMPLETE', { result });
  },

  renderLevelComplete(result) {
    const isLast = !this.isDaily && result.levelNumber === LevelEngine.TOTAL_LEVELS;
    this.root.innerHTML = `
      <div class="screen screen--center fade-in">
        <div class="confetti" aria-hidden="true">${this.confettiPieces()}</div>
        <h2 class="celebrate-title">🎉 LEVEL COMPLETE!</h2>
        <div class="stars-reveal">
          ${[0, 1, 2].map(i => `<span class="star-pop star-pop--${i}">${i < result.stars ? '⭐' : '☆'}</span>`).join('')}
        </div>
        <div class="score-block">
          <div class="score-block__label">SCORE</div>
          <div class="score-block__value" id="score-counter">0</div>
        </div>
        <div class="stat-card-row">
          <div class="stat-card"><div class="stat-card__label">TIME</div><div class="stat-card__value">${this.fmtTime(result.timeMs)}</div></div>
          <div class="stat-card"><div class="stat-card__label">MOVES</div><div class="stat-card__value">${result.moves}</div></div>
        </div>
        <div class="complete-buttons">
          ${this.isDaily
            ? '<button class="btn btn--primary btn--lg" data-action="goto" data-target="MENU">DONE</button>'
            : (isLast
                ? '<button class="btn btn--primary btn--lg" data-action="goto" data-target="LEVEL_SELECT">LEVELS</button>'
                : '<button class="btn btn--primary btn--lg" data-action="next-level">NEXT LEVEL</button>')}
          <button class="btn btn--secondary" data-action="replay-level">REPLAY</button>
          <button class="btn btn--ghost" data-action="goto" data-target="LEVEL_SELECT">LEVELS</button>
          <button class="btn btn--ghost" data-action="goto" data-target="LEADERBOARD">LEADERBOARD</button>
        </div>
      </div>`;
    this.animateScoreCounter(result.score);
  },

  confettiPieces() {
    const colors = ['#7C5CFC', '#39D6C8', '#FFB74A', '#FF6E9C'];
    let out = '';
    for (let i = 0; i < 24; i++) {
      const left = Math.random() * 100;
      const delay = Math.random() * 0.4;
      const color = colors[i % colors.length];
      out += `<span class="confetti-piece" style="left:${left}%;background:${color};animation-delay:${delay}s"></span>`;
    }
    return out;
  },

  animateScoreCounter(target) {
    const el = document.getElementById('score-counter');
    if (!el) return;
    const duration = 800;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(eased * target).toLocaleString();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  goNextLevel() {
    const next = this.session.level.number + 1;
    if (next > LevelEngine.TOTAL_LEVELS) return this.go('LEVEL_SELECT');
    this.go('PLAYING', { levelNumber: next });
  },

  // ------------------------------------------------------------- settings

  renderSettings() {
    const s = gameStorage.state.settings;
    const row = (key, label, icon) => `
      <div class="settings-row">
        <span>${icon} ${label}</span>
        <button class="switch ${s[key] ? 'switch--on' : ''}" data-action="toggle-setting" data-key="${key}" role="switch" aria-checked="${!!s[key]}"></button>
      </div>`;
    this.root.innerHTML = `
      <div class="screen fade-in">
        <div class="top-bar">
          <button class="icon-btn" data-action="goto" data-target="MENU">←</button>
          <h2 class="top-bar__title">SETTINGS</h2>
          <span></span>
        </div>
        <div class="settings-list">
          ${row('sound', 'Sound Effects', '🔊')}
          ${row('music', 'Music', '🎵')}
          ${row('vibration', 'Vibration', '📳')}
          ${row('reducedMotion', 'Reduced Motion', '🌙')}
          <div class="settings-row settings-row--button" data-action="change-username">
            <span>👤 Username</span><span class="settings-row__value">${gameStorage.get('username')} ›</span>
          </div>
          <div class="settings-row settings-row--button settings-row--danger" data-action="reset-progress">
            <span>🗑 Reset Progress</span><span>›</span>
          </div>
        </div>
      </div>`;
  },

  toggleSetting(key) {
    const cur = gameStorage.get(`settings.${key}`);
    gameStorage.set(`settings.${key}`, !cur);
    if (key === 'music') audioSystem.toggleMusic(!cur);
    if (key === 'reducedMotion') document.documentElement.classList.toggle('reduced-motion', !cur);
    this.renderSettings();
  },

  confirmReset() {
    if (window.confirm('This will erase all local progress, stars, and settings. This cannot be undone. Continue?')) {
      gameStorage.reset();
      audioSystem.reset();
      this.go('USERNAME_ENTRY');
    }
  },

  // ------------------------------------------------------------ leaderboard

  async renderLeaderboard() {
    this.root.innerHTML = `
      <div class="screen fade-in">
        <div class="top-bar">
          <button class="icon-btn" data-action="goto" data-target="MENU">←</button>
          <h2 class="top-bar__title">LEADERBOARD</h2>
          <span></span>
        </div>
        <div class="leaderboard-loading">Loading rankings…</div>
      </div>`;

    const username = gameStorage.get('username');
    try {
      const [board, rankInfo] = await Promise.all([
        LeaderboardService.getGlobalLeaderboard(20),
        username ? LeaderboardService.getPlayerRankInfo(username) : null
      ]);
      this.paintLeaderboard(board, rankInfo);
    } catch (e) {
      const container = this.root.querySelector('.leaderboard-loading');
      if (container) container.textContent = 'Leaderboard temporarily unavailable. You can keep playing offline — your scores will sync automatically once connected.';
    }
  },

  paintLeaderboard(board, rankInfo) {
    const rows = board.map(p => `
      <div class="lb-row ${p.username === gameStorage.get('username') ? 'lb-row--you' : ''}">
        <span class="lb-rank">#${p.rank}</span>
        <span class="lb-name">${p.username}</span>
        <span class="lb-level">Lv ${p.highest_level}</span>
        <span class="lb-stars">⭐ ${p.total_stars}</span>
        <span class="lb-score">${p.total_score.toLocaleString()}</span>
      </div>`).join('');

    let yourRankBlock = '';
    if (rankInfo && rankInfo.rank) {
      const nearbyRows = rankInfo.nearby.map(p => `
        <div class="lb-row lb-row--nearby ${p.username === gameStorage.get('username') ? 'lb-row--you' : ''}">
          <span class="lb-rank">#${p.rank}</span>
          <span class="lb-name">${p.username === gameStorage.get('username') ? 'YOU' : p.username}</span>
          <span class="lb-level">Lv ${p.highest_level}</span>
          <span class="lb-stars">⭐ ${p.total_stars}</span>
        </div>`).join('');
      yourRankBlock = `
        <div class="your-rank-card">
          <div class="your-rank-card__title">🏆 YOUR RANK</div>
          <div class="your-rank-card__big">#${rankInfo.rank} <span>/ ${rankInfo.totalPlayers} players</span></div>
          ${rankInfo.percentile !== null ? `<div class="your-rank-card__percentile">You're ahead of ${rankInfo.percentile}% of players!</div>` : ''}
          <div class="nearby-list">${nearbyRows}</div>
        </div>`;
    }

    this.root.innerHTML = `
      <div class="screen fade-in">
        <div class="top-bar">
          <button class="icon-btn" data-action="goto" data-target="MENU">←</button>
          <h2 class="top-bar__title">LEADERBOARD</h2>
          <span></span>
        </div>
        ${yourRankBlock}
        <div class="lb-list">
          <div class="lb-row lb-row--header">
            <span>#</span><span>PLAYER</span><span>LEVEL</span><span>STARS</span><span>SCORE</span>
          </div>
          ${rows}
        </div>
      </div>`;
  },

  // ----------------------------------------------------------- achievements

  renderAchievements() {
    const items = AchievementEngine.list().map(a => {
      const unlocked = AchievementEngine.isUnlocked(a.id);
      return `
        <div class="ach-card ${unlocked ? '' : 'ach-card--locked'}">
          <div class="ach-card__icon">${unlocked ? a.icon : '🔒'}</div>
          <div>
            <div class="ach-card__name">${a.name}</div>
            <div class="ach-card__desc">${a.desc}</div>
          </div>
        </div>`;
    }).join('');
    this.root.innerHTML = `
      <div class="screen fade-in">
        <div class="top-bar">
          <button class="icon-btn" data-action="goto" data-target="MENU">←</button>
          <h2 class="top-bar__title">ACHIEVEMENTS</h2>
          <span></span>
        </div>
        <div class="ach-list">${items}</div>
      </div>`;
  },

  // ---------------------------------------------------------------- stats

  renderStats() {
    const s = gameStorage.state.stats;
    const cards = [
      ['🎯', 'Levels Completed', s.levelsCompleted],
      ['⭐', 'Total Stars', s.totalStarsEarned],
      ['🏆', 'Total Score', s.totalScore.toLocaleString()],
      ['🔥', 'Highest Combo', `x${s.highestCombo}`],
      ['⚡', 'Fastest Level', s.fastestLevelMs ? this.fmtTime(s.fastestLevelMs) : '—'],
      ['💡', 'Hints Used', s.hintsUsed],
      ['⏱', 'Total Play Time', this.fmtTime(s.totalPlayTimeMs)],
      ['🎯', 'Accuracy', s.totalTaps ? `${Math.round(((s.totalTaps - s.totalMistakes) / s.totalTaps) * 100)}%` : '—']
    ];
    this.root.innerHTML = `
      <div class="screen fade-in">
        <div class="top-bar">
          <button class="icon-btn" data-action="goto" data-target="MENU">←</button>
          <h2 class="top-bar__title">STATISTICS</h2>
          <span></span>
        </div>
        <div class="stats-grid">
          ${cards.map(([icon, label, value]) => `
            <div class="stat-tile">
              <div class="stat-tile__icon">${icon}</div>
              <div class="stat-tile__value">${value}</div>
              <div class="stat-tile__label">${label}</div>
            </div>`).join('')}
        </div>
      </div>`;
  }
};

document.addEventListener('DOMContentLoaded', () => UI.init());
