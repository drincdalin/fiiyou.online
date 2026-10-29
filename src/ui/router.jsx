import { useSyncExternalStore } from 'react';

/* Tiny path router (real URLs, no #/hash). No dependencies.
 *   /            home
 *   /<username>  a profile (yours too: app.fiiyou.online/username)
 *   /map /people /chat /chat/<id> /post/<id> /tag/<hashtag> /admin   app pages
 * Needs the host to serve index.html for every path (vercel.json rewrite). */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, ''); // '' on app.fiiyou.online

/* Names a username may never take, because /<name> would collide with a real page or file. */
export const RESERVED = [
  // app pages
  'home', 'me', 'u', 'map', 'people', 'chat', 'messages', 'post', 'admin', 'notifications', 'invite', 'tag',
  // auth / meta pages
  'login', 'signup', 'settings', 'about', 'help', 'privacy', 'terms', 'api',
  // static files and folders
  'assets', 'icons', 'index.html', '404.html', 'terms.html', 'privacy.html', 'sw.js',
  'sitemap.xml', 'robots.txt', 'manifest.webmanifest', 'og-image.png', 'favicon.ico',
];
export const isReserved = (name) => RESERVED.includes(String(name).trim().toLowerCase());

const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
window.addEventListener('popstate', emit);
const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
export const getPath = () => location.pathname.slice(BASE.length) || '/';

/** Current path, e.g. '/dalin'. Re-renders when it changes. */
export const usePath = () => useSyncExternalStore(subscribe, getPath);

export function navigate(to, { replace = false } = {}) {
  const current = getPath().replace(/(.)\/+$/, '$1');
  if (!replace && to === current) { window.scrollTo(0, 0); return; }   // same page: no duplicate history entry
  history[replace ? 'replaceState' : 'pushState'](null, '', BASE + to);
  emit();
  if (!replace) window.scrollTo(0, 0);
}

const safeDecode = (x) => { try { return decodeURIComponent(x); } catch { return x; } };

/** '/' -> {page:'home'} | '/map' -> {page:'map', rest:[]} | '/chat/abc' -> {page:'chat', rest:['abc']}
 *  '/dalin' -> {page:'profile', username:'dalin', rest:[]} | '/dalin/edit' -> {..., rest:['edit']} */
export function parseRoute(path) {
  const seg = path.split('/').filter(Boolean);
  if (!seg.length) return { page: 'home', rest: [] };
  if (isReserved(seg[0])) return { page: seg[0].toLowerCase(), rest: seg.slice(1) };
  return { page: 'profile', username: safeDecode(seg[0]), rest: seg.slice(1) };
}

/** Drop-in for <a href="...">: a real link (middle-click, copy address) that navigates without a reload. */
export function Link({ to, replace, onClick, ...props }) {
  return (
    <a
      href={BASE + to}
      {...props}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || props.target) return;
        e.preventDefault();
        navigate(to, { replace });
      }}
    />
  );
}

/** Call once in main.jsx BEFORE createRoot(...).render(...).
 *  Old hash links keep working: /#/u/dennys -> /dennys, /#/me -> /me (App then rewrites it to /<username>),
 *  /#/chat/abc -> /chat/abc. Auth hashes like #access_token=... are left alone. */
export function bootRouter() {
  const m = location.hash.match(/^#(\/.*)$/);
  if (m) history.replaceState(null, '', BASE + m[1].replace(/^\/u\//, '/'));
}
export const bootRouterClean = bootRouter;   // alias, in case main.jsx already imports this name
