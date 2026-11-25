// "Install fiiyou as an app".
// Chromium browsers (Chrome, Edge, Brave, Opera, Vivaldi, Samsung Internet) announce that the site can be installed with a
// `beforeinstallprompt` event, once, early. We keep it here until the person presses an Install button (Settings or onboarding).
// Safari on iPhone / iPad has no such event: it needs Share > Add to Home Screen, so we explain that instead.
// This file is the single source of truth: the state, the prompt and the written steps are shared by Settings, onboarding and push.js.
import { useSyncExternalStore } from 'react';

let deferred = null; let installed = false; let captured = false; const subs = new Set(); const emit = () => subs.forEach((f) => f());
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Call once, as early as possible (main.jsx). Safe to call again (hot reload): the listeners are added only once. */
export function captureInstall() {
  if (captured) return; captured = true;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; emit(); });
  addEventListener('appinstalled', () => { installed = true; deferred = null; emit(); });
  // installed from the browser's own menu while this page stays open: the page switches to app mode without an event of ours
  try { matchMedia('(display-mode: standalone)').addEventListener('change', emit); } catch { /* old Safari: the state is re-read on the next render anyway */ }
}

/** 'installed' (already running as an app) | 'ready' (the browser can install it right now) | 'ios' | 'manual' (use the browser's own menu) */
export function installState() {
  if (installed || isStandalone()) return 'installed';
  if (deferred) return 'ready';
  return isIOS() ? 'ios' : 'manual';
}
export const useInstallState = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, installState, () => 'manual');

/** Shows the browser's install question. -> 'accepted' | 'dismissed' | 'unavailable' */
export async function promptInstall() {
  const e = deferred; if (!e) return 'unavailable';
  deferred = null; emit();   // the browser allows one question per event
  try { await e.prompt(); const { outcome } = await e.userChoice; return outcome; } catch { return 'unavailable'; }
}

/** The steps for browsers that cannot install with one click. `icon` is a hint for the screen that draws it (Settings only shows the text).
 *  state: 'ios' | anything else = the browser's own menu. */
export function installGuide(state) {
  if (state === 'ios') return {
    title: 'Add fiiyou to your Home Screen',
    steps: [
      { icon: 'share', text: 'Tap the Share button (the square with an arrow) in Safari.' },
      { icon: 'add', text: 'Scroll down and tap “Add to Home Screen”.' },
      { icon: 'done', text: 'Tap Add. From now on open fiiyou from your Home Screen.' },
    ],
    note: 'Using another browser and not seeing it? Open fiiyou in Safari.',
  };
  return {
    title: 'Install fiiyou',
    steps: [
      { icon: 'menu', text: 'Open the browser menu (⋮ or ⋯).' },
      { icon: 'add', text: 'Choose “Install fiiyou” or “Add to Home screen”.' },
    ],
    note: 'In Safari on a Mac use File, then “Add to Dock”. If you do not see any of these, this browser cannot install websites. Chrome, Edge, Brave and Opera can.',
  };
}
/** The same guide as one block of text, for the in-app message card. */
export function installGuideText(state) {
  const g = installGuide(state);
  return { title: g.title, message: `${g.steps.map((s, i) => `${i + 1}. ${s.text}`).join('\n')}\n\n${g.note}` };
}
