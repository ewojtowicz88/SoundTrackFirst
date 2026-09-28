importScripts('version.js');

const CACHE_NAME = `soundtrack-first-prototype-v${globalThis.SOUNDTRACKFIRST_VERSION}`;
const APP_FILES = ['./', 'index.html', 'styles.css', 'version.js', 'app.js', 'manifest.webmanifest', 'assets/soundtrack-first-logo.png', 'assets/score-to-scene-icon.png', 'assets/icon-180.png', 'assets/icon-192.png', 'assets/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('./')))
  );
});
