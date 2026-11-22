// "Install fiiyou as an app".
// Chromium browsers (Chrome, Edge, Brave, Opera, Vivaldi, Samsung Internet) announce that the site can be installed with a
// `beforeinstallprompt` event, once, early. We keep it here until the person presses the button in Settings.
// Safari on iPhone / iPad has no such event: it needs Share > Add to Home Screen, so Settings explains that instead.
import { useSyncExternalStore } from 'react';

let deferred = null; let installed = false; const subs = new Set(); const emit = () => subs.forEach((f) => f());
const standalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Call once, as early as possible (main.jsx). */
export function captureInstall() {
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; emit(); });
  addEventListener('appinstalled', () => { installed = true; deferred = null; emit(); });
}

/** 'installed' (already running as an app) | 'ready' (the browser can install it right now) | 'ios' | 'manual' (use the browser's own menu) */
export function installState() {
  if (installed || standalone()) return 'installed';
  if (deferred) return 'ready';
  return ios() ? 'ios' : 'manual';
}
export const useInstallState = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, installState, () => 'manual');

/** Shows the browser's install question. -> 'accepted' | 'dismissed' | 'unavailable' */
export async function promptInstall() {
  const e = deferred; if (!e) return 'unavailable';
  deferred = null; emit();   // the browser allows one question per event
  try { await e.prompt(); const { outcome } = await e.userChoice; return outcome; } catch { return 'unavailable'; }
}
