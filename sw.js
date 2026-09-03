/* וייטנאם 2026 — service worker.
   Two caches with different jobs:
     SHELL  — the app itself (html, css, fonts, icons). Precached on install,
              so the app opens with no network at all.
     PHOTOS — the Wikimedia photos. Cross-origin and heavy, so they are NOT
              precached; the ⬇ button in the app fills this cache on demand,
              and this worker serves whatever is already in it. */

const VERSION = 'v29';
const SHELL = 'vn-shell-' + VERSION;
const PHOTOS = 'vn-photos-v1';          // kept unversioned: photos never change

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './fonts/fonts.css',
  './fonts/gveret-levin-400-hebrew.woff2',
  './fonts/gveret-levin-400-latin.woff2',
  './fonts/heebo-400-hebrew.woff2',
  './fonts/heebo-400-latin.woff2',
  './fonts/caveat-500-latin.woff2',
  './fonts/jetbrains-mono-700-latin.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-48.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png',
  './icons/og.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    /* One at a time rather than addAll: a single 404 must not sink the install. */
    await Promise.all(SHELL_FILES.map(f => cache.add(f).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, PHOTOS]);
    const names = await caches.keys();
    await Promise.all(names.map(n => keep.has(n) ? null : caches.delete(n)));
    await self.clients.claim();
  })());
});

const isPhoto = url => url.hostname.endsWith('wikimedia.org');

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* Navigations: network first so a redeploy is picked up, cache as the
     fallback so the app still opens on a plane or with no signal. */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  /* Photos: cache first, and quietly fill the cache on any miss that
     succeeds — so simply browsing the days on wifi banks them too. */
  if (isPhoto(url)) {
    event.respondWith((async () => {
      const hit = await caches.match(req, { cacheName: PHOTOS });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        const cache = await caches.open(PHOTOS);
        cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch (e) {
        return Response.error();
      }
    })());
    return;
  }

  /* Everything else same-origin: cache first, it is all static. */
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(SHELL)).put(req, res.clone()).catch(() => {});
        return res;
      } catch (e) {
        return Response.error();
      }
    })());
  }
});
