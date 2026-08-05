/* IBUKI STUDY BEAT — Service Worker (オフライン対応) */
var CACHE = 'isb-v3.1.0';
var ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/calc.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './assets/char/coach_stage.png',
  './assets/char/pose_smooth_criminal.png',
  './assets/char/pose_moonwalk.png',
  './assets/char/pose_thriller.png',
  './assets/char/pose_billie_jean.png',
  './assets/char/pose_heel_toe.png',
  './assets/char/pose_zero_gravity.png',
  './assets/char/pose_spin_turn.png',
  './assets/char/pose_windmill.png',
  './assets/char/pose_end_pose.png',
  './assets/char/cele_nicebeat.png',
  './assets/char/cele_streak7.png',
  './assets/char/cele_hours20.png',
  './assets/char/cele_goal.png',
  './assets/char/cele_exam_done.png',
  './assets/char/cele_gokaku.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (cached) {
      var network = fetch(e.request).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
