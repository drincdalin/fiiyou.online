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

const sameKey = (sub) => {   // a device subscribed with an OLD key pair can never receive anything from the current server keys
  const k = sub?.options?.applicationServerKey; if (!k) return true;
  const a = new Uint8Array(k); const b = toBytes(KEY);
  return a.length === b.length && a.every((v, i) => v === b[i]);
};
/** This device's subscription, or null. A subscription made with a different key is dropped here, so the next "Turn on" makes a good one. */
async function currentSub(reg) {
  let sub = await reg?.pushManager.getSubscription();
  if (sub && !sameKey(sub)) { await sub.unsubscribe().catch(() => {}); sub = null; }
  return sub || null;
}
const swReady = () => Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('The service worker did not start. Reload the page and try again.')), 8000))]);

/** 'noconfig' | 'install' (iPhone, not added to the home screen yet) | 'unsupported' | 'denied' | 'off' | 'on' */
export async function pushStatus() {
  if (!KEY) return 'noconfig';
  if (ios() && !standalone()) return 'install';
  if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await currentSub(await navigator.serviceWorker.getRegistration(BASE));
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Asks for permission, subscribes this device and saves it for the signed-in person. Throws 'denied' when the person says no.
 *  If saving fails the browser subscription is removed again, so "on" never means "on in the browser but unknown to the server". */
export async function enablePush() {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('denied');
  const reg = await swReady();
  const sub = (await currentSub(reg)) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(KEY) }));
  try { await social.savePushSubscription(sub.toJSON()); }
  catch (e) { await sub.unsubscribe().catch(() => {}); throw e; }
}

/** Run once after sign-in: re-saves this device for whoever is signed in now. Fixes a device the server forgot (an earlier failed save, a
 *  database reset, a browser shared by two accounts, an endpoint the browser rotated). Silent; does nothing unless push is already allowed. */
export async function syncPush() {
  try {
    if (!KEY || !('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) || Notification.permission !== 'granted') return;
    const sub = await currentSub(await navigator.serviceWorker.getRegistration(BASE));
    if (sub) await social.savePushSubscription(sub.toJSON());
  } catch { /* best effort */ }
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
