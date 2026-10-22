/* Offline PDF Toolkit — offline cache. Network-first for HTML so updates land. */
const VERSION = 'pdftk-v4';
const CORE = ['./', './app.html', './index.html', './manifest.webmanifest', './assets/icon.svg'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('./app.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const cp = res.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return res; })));
});
