/* Invite links:  https://<site>/invite/<username>
 * Opening one remembers who invited you (in this browser, and in your account once you sign up), and shows "<username> invited you" on the sign-up form.
 * After sign-up the welcome steps suggest adding the inviter first. Nothing is tracked beyond that username. */
const KEY = 'fiiyou_invite';
export const USERNAME_RE = /^[a-z0-9_]{3,24}$/;
const defaultStore = () => { try { return globalThis.localStorage || null; } catch { return null; } };

/** '/invite/Dalin' -> 'dalin'; anything else (or an invalid name) -> null. base = the site's sub-path ('' normally). */
export function parseInvitePath(pathname, base = '') {
  const p = base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  const m = /^\/invite\/([^/]+)\/?$/i.exec(p); if (!m) return null;
  let u; try { u = decodeURIComponent(m[1]).toLowerCase(); } catch { return null; }
  return USERNAME_RE.test(u) ? u : null;
}

export function getInvite({ storage = defaultStore() } = {}) {
  try { const u = (storage?.getItem(KEY) || '').toLowerCase(); return USERNAME_RE.test(u) ? u : null; } catch { return null; }
}
export function clearInvite({ storage = defaultStore() } = {}) { try { storage?.removeItem(KEY); } catch { /* ignore */ } }

/** Call once at start-up. If the address is an invite link: remember it and swap the address for '/', so a refresh does not repeat it. */
export function captureInvite({ loc = globalThis.location, hist = globalThis.history, base = '', storage = defaultStore() } = {}) {
  const u = parseInvitePath(loc.pathname, base); if (!u) return null;
  try { storage?.setItem(KEY, u); } catch { /* ignore */ }
  try { hist.replaceState(null, '', (base || '') + '/'); } catch { /* ignore */ }
  return u;
}

export const inviteUrl = (origin, base, username) => `${origin}${base || ''}/invite/${String(username).toLowerCase()}`;
