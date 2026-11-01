// 2D6 service worker template. scripts/pwaPlugin.ts fills in the three placeholders at build time.
// Rules: precache the whole build into a per-build cache; never skipWaiting by itself (the page asks);
// navigations get the cached index.html; same-origin GETs are cache-first; everything else is untouched.
const CACHE = '__CACHE__';
const PRECACHE = __PRECACHE__; // paths relative to this file, e.g. "index.html", "assets/app-abc.js"

const scopeUrl = (p) => new URL(p, self.registration.scope).href;
// The app shell is cached under the scope root, not index.html: Cloudflare Pages 308-redirects /index.html to /,
// and a redirected response can't be served to a navigation.
const SHELL = scopeUrl('./');
const keyFor = (p) => (p === 'index.html' ? SHELL : scopeUrl(p));

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // cache: 'reload' bypasses the HTTP cache so a new build never precaches stale files.
      await Promise.all(
        PRECACHE.map(async (p) => {
          const key = keyFor(p);
          let res = await fetch(new Request(key, { cache: 'reload' }));
          if (!res.ok) throw new Error(`precache ${p}: ${res.status}`);
          // Drop the `redirected` flag: rebuild the response from its body.
          if (res.redirected) res = new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
          await cache.put(key, res);
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('2d6-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      caches
        .open(CACHE)
        .then((c) => c.match(SHELL))
        .then((hit) => hit || fetch(req))
        .catch(async () => (await (await caches.open(CACHE)).match(SHELL)) || Response.error()),
    );
    return;
  }
  event.respondWith(
    caches.open(CACHE).then(async (c) => (await c.match(req)) || fetch(req)),
  );
});
