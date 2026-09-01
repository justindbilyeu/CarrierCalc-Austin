// CarrierCalc service worker — build c09a1c760aa6
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
const VERSION = 'c09a1c760aa6';
// The prefix identifies this page's caches; the version distinguishes builds of
// it. Both are needed on activate, because caches.keys() returns every cache on
// the whole origin -- including other CarrierCalc pages served from the same
// site. The build version is a hex hash and never contains a dash, which is how
// 'carriercalc-austin-' tells its own caches apart from
// 'carriercalc-austin-portfolio-'.
const CACHE_PREFIX = 'carriercalc-austin-portfolio-';
const CACHE = CACHE_PREFIX + VERSION;
const isOwnCache = k => k.startsWith(CACHE_PREFIX) && !k.slice(CACHE_PREFIX.length).includes('-');
const PAGE = new URL('./', self.location).href;
const NETWORK_TIMEOUT_MS = 3000;

// A worker's scope is the directory it is served from, which for these deploys
// is the whole site — so this worker sees navigations to pages that are not its
// own: the /david/ redirect today, a second build in the same repo tomorrow.
// It must never store one of those under its own cache key, or a rep's offline
// copy quietly becomes a different page and they find out with no signal.
const PAGE_PATH = new URL(PAGE).pathname;
function isOwnPage(url) {
  const p = new URL(url).pathname;
  return p === PAGE_PATH || p === PAGE_PATH + 'index.html';
}

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
      // Clear older versions of THIS page only. The original filter deleted
      // every other cache on the origin, so opening a second CarrierCalc page
      // wiped the first one's offline copy outright -- worse than staleness,
      // and invisible until a rep lost signal.
      .then(keys => Promise.all(
        keys.filter(k => isOwnCache(k) && k !== CACHE).map(k => caches.delete(k))))
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
        // Store under the bare page URL so every ?rep= link shares one entry —
        // but only when this really is our page. Serving another page fresh is
        // fine; caching it as ours is the bug.
        if (isOwnPage(req.url)) cache.put(PAGE, fresh.clone());
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
