/* Generated with the production simulator's exact static dependencies. */
const prefix = 'nexus-3d-flight-';
const cacheName = prefix + '__REVISION__';
const files = __FILES__;
const routes = new Set(__ROUTES__);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    // addAll commits atomically. An auth redirect or partial deploy fails integrity.
    const requests = Object.entries(files).map(([path, integrity]) =>
      new Request(new URL(path, self.location.origin), { integrity, cache: 'reload', redirect: 'error', credentials: 'omit' }));
    await cache.addAll(requests);
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const isGamePage = url => routes.has(url.pathname) && url.searchParams.get('launch') !== 'live';
  let key = url.pathname;
  if (request.mode === 'navigate') {
    if (!isGamePage(url)) return;
    key = '/index.html';
  } else if (url.search || !Object.hasOwn(files, key)) return;
  event.respondWith((async () => {
    if (request.mode !== 'navigate') {
      const client = event.clientId && await self.clients.get(event.clientId);
      if (!client || !isGamePage(new URL(client.url))) return fetch(request);
    }
    const cache = await caches.open(cacheName);
    return (await cache.match(new URL(key, self.location.origin).href)) || fetch(request);
  })());
});
