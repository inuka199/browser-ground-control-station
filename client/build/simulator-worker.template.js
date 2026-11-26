/* Generated with the production simulator's exact static dependencies. */
const prefix = 'nexus-3d-flight-';
const cacheName = prefix + '__REVISION__';
const files = __FILES__;
const routes = new Set(__ROUTES__);
// Static hosts can redirect index.html or personalize online navigation. Keep
// the build's offline document with the worker and never persist a login page.
const offlineHtml = __OFFLINE_HTML__;
async function download() {
    const cache = await caches.open(cacheName);
    // addAll commits atomically. An auth redirect or partial deploy fails integrity.
    const requests = Object.entries(files).map(([path, integrity]) =>
      new Request(new URL(path, self.location.origin), { integrity, cache: 'reload', redirect: 'error', credentials: 'same-origin' }));
    await cache.addAll(requests);
}
self.addEventListener('install', event => event.waitUntil(download()));
self.addEventListener('message', event => {
  const reply = event.ports[0];
  if (!reply || !event.source?.url) return;
  const source = new URL(event.source.url);
  if (source.origin !== self.location.origin || source.pathname.replace(/\/$/, '') !== '/simulator') return;
  event.waitUntil((async () => {
    try {
      if (event.data === 'ACTIVATE') {
        const tabs = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
        if (tabs.some(tab => tab.id !== event.source.id)) {
          reply.postMessage('OTHER_TABS');
          return;
        }
        await self.skipWaiting();
        reply.postMessage('ACTIVATING');
        return;
      }
      if (event.data !== 'CHECK' && event.data !== 'REPAIR') return;
      if (event.data === 'REPAIR') await download();
      const cache = await caches.open(cacheName);
      const saved = new Set((await cache.keys()).map(request => request.url));
      const complete = Object.keys(files).every(path => saved.has(new URL(path, self.location.origin).href));
      reply.postMessage(complete ? 'COMPLETE' : 'INCOMPLETE');
    } catch {
      reply.postMessage('FAILED');
    }
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
  const isGamePage = url => routes.has(url.pathname.replace(/\/$/, '')) && url.searchParams.get('launch') !== 'live';
  const key = url.pathname;
  if (request.mode === 'navigate') {
    if (!isGamePage(url)) return;
  } else if (url.search || !Object.hasOwn(files, key)) return;
  event.respondWith((async () => {
    if (request.mode === 'navigate') {
      // An online launch must pass through the host's normal access checks.
      try { return await fetch(request); } catch {
        return new Response(offlineHtml, { headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"
        } });
      }
    } else {
      const client = event.clientId && await self.clients.get(event.clientId);
      if (!client || !isGamePage(new URL(client.url))) return fetch(request);
    }
    const cache = await caches.open(cacheName);
    return (await cache.match(new URL(key, self.location.origin).href)) || fetch(request);
  })());
});
