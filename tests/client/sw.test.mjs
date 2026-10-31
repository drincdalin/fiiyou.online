// Runs public/sw.js in a fake service-worker scope and checks the offline-shell rules.
import test from 'node:test'; import assert from 'node:assert/strict'; import vm from 'node:vm'; import fs from 'node:fs';
const src = fs.readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

function boot({ online = true, pages = {} } = {}) {
  const listeners = {}; const store = new Map(); const stores = new Map();
  const mkCache = (name) => { const m = stores.get(name) || new Map(); stores.set(name, m);
    return { put: async (k, v) => { m.set(typeof k === 'string' ? k : k.url, v); }, addAll: async () => {}, keys: async () => [...m.keys()].map((u) => ({ url: u })), delete: async (k) => m.delete(typeof k === 'string' ? k : k.url) }; };
  const env = {
    URL, Response, console, setTimeout,
    self: { location: new URL('https://app.test/sw.js'), registration: { scope: 'https://app.test/', showNotification() {} }, clients: { claim: async () => {}, matchAll: async () => [] }, skipWaiting: async () => {}, addEventListener: (t, f) => { listeners[t] = f; } },
    caches: { open: async (n) => mkCache(n), keys: async () => [...stores.keys()], delete: async (n) => stores.delete(n),
      match: async (req) => { const u = typeof req === 'string' ? req : req.url; for (const m of stores.values()) if (m.has(u)) return m.get(u).clone(); return undefined; } },
    fetch: async (req) => { if (!online) throw new Error('offline'); const p = pages[new URL(req.url).pathname]; return p ? new Response(p.body, { status: p.status || 200, headers: { 'content-type': p.type } }) : new Response('<html>spa</html>', { headers: { 'content-type': 'text/html' } }); },
  };
  env.self.fetch = env.fetch; vm.runInNewContext(src, env);
  const run = async (url, { mode = 'cors', method = 'GET' } = {}) => { let p; listeners.fetch({ request: { url, mode, method }, respondWith: (x) => { p = x; } }); return p ? await p : undefined; };
  return { run, stores, setOnline: (v) => { online = v; } };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test('a page opened online is stored and served when offline', async () => {
  const w = boot(); const a = await w.run('https://app.test/dalin', { mode: 'navigate' }); assert.equal(a.status, 200); await tick();
  w.setOnline(false); const b = await w.run('https://app.test/map', { mode: 'navigate' }); assert.equal(b.status, 200); assert.match(await b.text(), /spa/);
});
test('offline with nothing cached shows the built-in offline page (503)', async () => {
  const w = boot({ online: false }); const r = await w.run('https://app.test/', { mode: 'navigate' }); assert.equal(r.status, 503); assert.match(await r.text(), /You are offline/);
});
test('hashed assets are cache-first; an html answer for a missing asset is NOT cached', async () => {
  const w = boot({ pages: { '/assets/a-1.js': { body: 'js', type: 'text/javascript' } } });
  await w.run('https://app.test/assets/a-1.js'); await tick(); w.setOnline(false);
  assert.equal(await (await w.run('https://app.test/assets/a-1.js')).text(), 'js');
  const w2 = boot(); await w2.run('https://app.test/assets/missing.js'); await tick(); assert.equal([...(w2.stores.get('fiiyou-assets-v2') || new Map()).keys()].length, 0);
});
test('cross-origin, POST and sw.js are never handled', async () => {
  const w = boot();
  assert.equal(await w.run('https://xyz.supabase.co/rest/v1/posts'), undefined); assert.equal(await w.run('https://app.test/x', { method: 'POST' }), undefined); assert.equal(await w.run('https://app.test/sw.js'), undefined);
});
test('non-navigation api-like paths are left alone (no caching of app data)', async () => {
  const w = boot(); assert.equal(await w.run('https://app.test/some/data.json'), undefined);
});
