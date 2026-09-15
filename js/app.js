/**
 * app.js
 * Top-level bootstrap: applies saved accessibility preferences and
 * registers the service worker for offline/PWA support. Actual game
 * startup happens in ui.js (UI.init on DOMContentLoaded).
 */

(function () {
  try {
    const reduced = gameStorage.get('settings.reducedMotion') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.classList.toggle('reduced-motion', !!reduced);
  } catch (e) { /* ignore */ }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((err) => {
        console.warn('Service worker registration failed (this is fine on non-https/local dev):', err);
      });
    });
  }

  window.addEventListener('online', () => UI && UI.toast && UI.toast('Back online — syncing leaderboard…'));
  window.addEventListener('offline', () => UI && UI.toast && UI.toast('You\u2019re offline. Your progress still saves locally.'));
})();
