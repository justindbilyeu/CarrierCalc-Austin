// CarrierCalc service worker — build ae37a9bc9a02
//
// Reps open this at a customer's front door, sometimes with no usable signal.
// The page is a single self-contained file, so offline support is just caching
// one document.
//
// Strategy is network-first with a short timeout, NOT cache-first. A rep with
// signal must always get the current build: these pages show insurance figures,
// and serving a stale one to save 200ms is the wrong trade. Cache-first would
// also mean a deploy could sit unseen behind a warm cache for days. When the
// network is slow or absent, the cached copy takes over.
//
// The cache name carries the build hash, so every deploy lands in a fresh cache
// and the old one is deleted on activate. A stale page cannot survive a deploy.
const VERSION = 'ae37a9bc9a02';
const CACHE = 'carriercalc-austin-' + VERSION;
const PAGE = new URL('./', self.location).href;
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.add(PAGE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await Promise.race([
        fetch(req),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('network timeout')), NETWORK_TIMEOUT_MS))
      ]);
      if (fresh && fresh.ok) {
        // Store under the bare page URL so every ?rep= link shares one entry.
        cache.put(PAGE, fresh.clone());
        return fresh;
      }
      throw new Error('bad response');
    } catch (err) {
      // ignoreSearch: a rep's ?rep=david link must resolve to the cached page.
      const cached = (await cache.match(PAGE)) ||
                     (await cache.match(req, { ignoreSearch: true }));
      if (cached) return cached;
      throw err;
    }
  })());
});
