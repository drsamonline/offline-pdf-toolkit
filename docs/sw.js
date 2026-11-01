/* Offline PDF Toolkit — the offline cache.
 *
 * Two deployments share this one file: the repository root (app at app.html)
 * and the Pages site (app at play/). So every path below is written to be valid
 * from either one, and each entry is added on its own — a path that does not
 * exist in one deployment must not take the whole cache down with it.
 *
 * HTML is network-first: the cache is only the offline fallback. A cache-first
 * page is how a shipped change becomes invisible to anyone who has visited
 * before. Bump CACHE on every release.
 */
const CACHE = 'pdftk-v6';   // bump on every release, or returning readers keep the old app
const CORE = [
  './',
  './index.html',
  './app.html',
  './play/',
  './play/index.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/icon-192.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(CORE.map(u => c.add(new Request(u, {cache:'reload'})).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    e.respondWith(
      fetch(req)
        .then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; })
        .catch(() => caches.match(req).then(r =>
          r || caches.match('./') || caches.match('./app.html') || caches.match('./play/index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        const cp = res.clone();
        caches.open(CACHE).then(c => c.put(req, cp));
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
