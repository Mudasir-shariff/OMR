/* =============================================
   OMR Dot Scanner — Service Worker
   Cache-first for app shell, network-first for CDN
   ============================================= */

const CACHE_NAME = 'omr-scanner-v1';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './scanner.js',
  './storage.js',
  './export.js',
  './manifest.json'
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first for app shell, network-first for CDN resources
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // For CDN resources (OpenCV, SheetJS, fonts): network-first with cache fallback
  if (url.hostname !== location.hostname) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // For app files: cache-first with network fallback
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});
