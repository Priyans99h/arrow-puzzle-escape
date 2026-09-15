/**
 * service-worker.js
 * Caches the app shell so the core game (offline gameplay, local save,
 * stats) works with no network connection. Only the leaderboard requires
 * connectivity, and that already fails gracefully in the app.
 */

const CACHE_NAME = 'arrow-puzzle-escape-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './css/animations.css',
  './js/storage.js',
  './js/levels.js',
  './js/audio.js',
  './js/score.js',
  './js/achievements.js',
  './js/dailyChallenge.js',
  './js/services/leaderboard.js',
  './js/player.js',
  './js/game.js',
  './js/ui.js',
  './js/app.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Never cache leaderboard/backend calls — always hit the network (or fail gracefully).
  if (req.url.includes('supabase.co')) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
