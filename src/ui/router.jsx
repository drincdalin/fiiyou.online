import { useSyncExternalStore } from 'react';

/* Tiny path router (replaces #/hash routing). No dependencies. */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, ''); // '' on app.fiiyou.online

/* Names a username may never take, because /<name> would collide with a real page or file. */
export const RESERVED = ['u', 'login', 'signup', 'settings', 'api', 'assets', 'admin', 'about', 'help', 'privacy', 'terms',
  '404.html', 'index.html', 'sitemap.xml', 'robots.txt', 'manifest.webmanifest', 'og-image.png', 'favicon.ico'];
export const isReserved = (name) => RESERVED.includes(String(name).toLowerCase());

const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
window.addEventListener('popstate', emit);
const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
const getPath = () => location.pathname.slice(BASE.length) || '/';

/** Current path, e.g. '/dalin'. Re-renders when it changes. */
export const usePath = () => useSyncExternalStore(subscribe, getPath);

export function navigate(to, { replace = false } = {}) {
  history[replace ? 'replaceState' : 'pushState'](null, '', BASE + to);
  emit();
  window.scrollTo(0, 0);
}

/** '/' -> {page:'home'} | '/settings' -> {page:'settings'} | '/dalin' -> {page:'profile', username:'dalin'} */
export function parseRoute(path) {
  const seg = path.split('/').filter(Boolean);
  if (!seg.length) return { page: 'home' };
  if (isReserved(seg[0])) return { page: seg[0], rest: seg.slice(1) };
  return { page: 'profile', username: decodeURIComponent(seg[0]) };
}

/** Drop-in for <a href="#/..."> */
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

/** Call once in main.jsx BEFORE createRoot(...).render(...) */
export function bootRouter() {
  // 1. arrived through 404.html: restore the real path
  const saved = sessionStorage.getItem('fiiyou:redirect');
  if (saved) { sessionStorage.removeItem('fiiyou:redirect'); history.replaceState(null, '', saved); }
  // 2. old shared links: /#/u/dalin -> /dalin, /#/settings -> /settings (auth tokens like #access_token=... are untouched)
  const m = location.hash.match(/^#(\/.*)$/);
  if (m) history.replaceState(null, '', BASE + m[1].replace(/^\/u\//, '/'));
}
