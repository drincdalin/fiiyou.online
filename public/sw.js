/* fiiyou service worker: shows push notifications and opens the right page when one is tapped.
   It does no caching, so it can never serve a stale copy of the app. Lives in /public so it is served from the site root. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

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
      icon: `${scope}icons/icon-192.png`,
      badge: `${scope}icons/icon-192.png`,
      tag: d.tag || undefined,          // same tag = replaces the older notification instead of stacking
      renotify: !!d.tag,
      data: { path: typeof d.path === 'string' ? d.path : '' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data && event.notification.data.path ? event.notification.data.path : '';
  const url = new URL(path, self.registration.scope).href;   // e.g. <site>/#/post/<id>
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const mine = all.find((c) => c.url.startsWith(self.registration.scope));
    if (mine) { await mine.focus(); try { await mine.navigate(url); } catch { /* ignore */ } return; }
    await self.clients.openWindow(url);
  })());
});
