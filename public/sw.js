/* fiiyou service worker.
   1. Push: shows notifications and opens the right page when one is tapped.
   2. Offline shell: the app opens without a connection and shows a clear "offline" state instead of the browser's dino page.
      - pages (navigations): network first, so people always get the newest version when online; the last good copy is the fallback
      - /assets/* (file names contain a content hash, so a file never changes): cache first
      - icons, fonts, manifest: show the cached copy, refresh it in the background
      - everything cross-origin (Supabase API and files, map tiles, YouTube...) is never touched or stored
   Bump VERSION to throw away every old cache. Lives in /public so it is served from the site root. */
const VERSION = 'v2';
const SHELL = `fiiyou-shell-${VERSION}`;
const ASSETS = `fiiyou-assets-${VERSION}`;
const MAX_ASSETS = 120;   // hashed files pile up across deployments; the oldest are dropped

const OFFLINE_HTML = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>fiiyou · offline</title>'
  + '<body style="font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center;background:#111;color:#eee">'
  + '<main><h1 style="margin:0 0 8px">You are offline</h1><p style="opacity:.75;margin:0 0 20px">fiiyou needs a connection to load your feed. Check your network and try again.</p>'
  + '<button onclick="location.reload()" style="font:inherit;padding:10px 18px;border-radius:10px;border:0;cursor:pointer">Try again</button></main>';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    try {   // best effort: the app still installs when this fails
      const c = await caches.open(SHELL);
      await c.addAll([self.registration.scope, `${self.registration.scope}icon-192.png`]);
    } catch { /* ignore */ }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('fiiyou-') && k !== SHELL && k !== ASSETS) await caches.delete(k);
  await self.clients.claim();
})()));

const isHtml = (r) => (r.headers.get('content-type') || '').includes('text/html');
async function trim(cache, max) { const keys = await cache.keys(); for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]); }

self.addEventListener('fetch', (event) => {
  const req = event.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('/sw.js')) return;
  const scope = new URL(self.registration.scope);
  const rel = url.pathname.slice(scope.pathname.length);   // path inside the app, no leading slash

  if (req.mode === 'navigate') {   // one index.html serves every app route, so it is stored once, under the scope address
    const key = /\.html$/.test(rel) ? req.url : scope.href;
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && isHtml(res)) { const c = await caches.open(SHELL); c.put(key, res.clone()).catch(() => {}); }
        return res;
      } catch {
        return (await caches.match(key)) || (await caches.match(scope.href)) || new Response(OFFLINE_HTML, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  if (rel.startsWith('assets/')) {
    event.respondWith((async () => {
      const hit = await caches.match(req); if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && !isHtml(res)) { const c = await caches.open(ASSETS); c.put(req, res.clone()).then(() => trim(c, MAX_ASSETS)).catch(() => {}); }   // an html answer for a missing file is not an asset
      return res;
    })());
    return;
  }

  if (/^(fonts\/|icon-|android-chrome|apple-touch|favicon|manifest\.webmanifest|og-image)/.test(rel)) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      const fresh = fetch(req).then((res) => { if (res.ok && !isHtml(res)) caches.open(ASSETS).then((c) => c.put(req, res.clone())).catch(() => {}); return res; }).catch(() => null);
      return hit || (await fresh) || Response.error();
    })());
  }
});

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : '' }; }
  const scope = self.registration.scope;
  event.waitUntil((async () => {
    // the app is open and in front: the in-app badge already shows it, so no system notification is needed
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (open.some((c) => c.visibilityState === 'visible' && c.focused)) return;
    await self.registration.showNotification(d.title || 'fiiyou', {
      body: d.body || '',
      icon: `${scope}icon-192.png`,
      badge: `${scope}icon-192.png`,
      tag: d.tag || undefined,          // same tag = replaces the older notification instead of stacking
      renotify: !!d.tag,
      data: { path: typeof d.path === 'string' ? d.path : '' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data && event.notification.data.path ? event.notification.data.path : '';
  const url = new URL(path, self.registration.scope).href;   // e.g. <site>/post/<id>
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const mine = all.find((c) => c.url.startsWith(self.registration.scope));
    if (mine) { await mine.focus(); try { await mine.navigate(url); } catch { /* ignore */ } return; }
    await self.clients.openWindow(url);
  })());
});
