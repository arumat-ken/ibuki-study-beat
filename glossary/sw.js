/* IBUKI STUDY BEAT 用語集 — Service Worker
 *
 * Scope is this directory only (glossary/), so it never touches the main app.
 * Shell files are cache-first; GLOSSARY.md is network-first so a Codex edit
 * shows up on the next online launch, with the cached copy as the offline
 * fallback.
 *
 * Bump CACHE whenever a shell file changes.
 */
var CACHE = 'isb-glossary-v1';

var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  '../docs/GLOSSARY.md'
];

var SOURCE_PATH = '/docs/GLOSSARY.md';

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The glossary source: prefer the network, fall back to the last good copy.
  if (url.pathname.indexOf(SOURCE_PATH) >= 0) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req);
      })
    );
    return;
  }

  // Everything else in scope: cache first.
  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    }).catch(function () {
      return caches.match('./index.html');
    })
  );
});
