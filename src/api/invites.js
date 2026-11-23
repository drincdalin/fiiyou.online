import { supabase } from '../lib/client.js';

/* One random id per browser, used only to count a visit once per inviter per week.
   It is not an account id, an IP address or a fingerprint. */
const KEY = 'fiiyou_visitor';
const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function visitorKey({ storage = (() => { try { return globalThis.localStorage; } catch { return null; } })() } = {}) {
  try {
    const old = storage?.getItem(KEY);
    if (KEY_RE.test(old || '')) return old;
    const fresh = globalThis.crypto?.randomUUID?.() || `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    storage?.setItem(KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}

/** Remember that this browser opened /invite/<username>. Never throws: analytics must not break the page. */
export async function recordInviteVisit(username) {
  if (!/^[a-z0-9_]{3,24}$/.test(String(username || ''))) return;
  const key = visitorKey();
  if (!key) return;
  try { await supabase.rpc('record_invite_visit', { p_username: username, p_key: key }); } catch { /* ignore */ }
}
