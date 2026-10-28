// Web Push for fiiyou: registers the service worker (public/sw.js) and subscribes this device.
// Needs VITE_VAPID_PUBLIC_KEY in .env (the public half of the VAPID key pair). Without it the toggle stays hidden.
import { social } from '../index.js';

const BASE = import.meta.env.BASE_URL;
const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

const toBytes = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); return Uint8Array.from(atob((s + p).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)); };
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Call once when the app starts. Also what makes the site installable. */
export function registerSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE }).catch(() => {});
}

/** 'noconfig' | 'install' (iPhone, not added to the home screen yet) | 'unsupported' | 'denied' | 'off' | 'on' */
export async function pushStatus() {
  if (!KEY) return 'noconfig';
  if (ios() && !standalone()) return 'install';
  if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration(BASE);
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Asks for permission, subscribes this device and saves it for the signed-in person. Throws 'denied' when the person says no. */
export async function enablePush() {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('denied');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(KEY) }));
  await social.savePushSubscription(sub.toJSON());
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration(BASE);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await social.removePushSubscription(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}

/** Run before signing out, so the next person on this device does not receive your notifications. */
export const forgetDevice = () => disablePush().catch(() => {});
