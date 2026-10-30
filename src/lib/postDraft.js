// Draft of the post composer, kept in this browser only (localStorage), per person and per place of posting.
// Only text and choices are stored, never photos. A draft older than 3 days is ignored and deleted.
export const MAX_AGE = 3 * 24 * 3600e3;
const PREFIX = 'fiiyou:postdraft:';
const defaultStore = () => { try { return globalThis.localStorage || null; } catch { return null; } };
export const postDraftKey = (userId, scope = 'home') => `${PREFIX}${userId}:${scope}`;
const FIELDS = ['body', 'kind', 'visibility', 'place', 'title', 'when', 'where'];

export const isEmptyDraft = (d) => !d || !String(d.body || '').trim() && !String(d.title || '').trim();

export function savePostDraft(userId, scope, draft, { now = Date.now(), storage = defaultStore() } = {}) {
  if (!userId || !storage) return;
  try {
    if (isEmptyDraft(draft)) { storage.removeItem(postDraftKey(userId, scope)); return; }
    const d = {}; for (const k of FIELDS) if (typeof draft[k] === 'string') d[k] = draft[k].slice(0, 1200);
    storage.setItem(postDraftKey(userId, scope), JSON.stringify({ t: now, d }));
  } catch { /* storage full or blocked: drafts are a convenience */ }
}
export function clearPostDraft(userId, scope, { storage = defaultStore() } = {}) { try { storage?.removeItem(postDraftKey(userId, scope)); } catch { /* ignore */ } }
/** -> the saved fields, or null when there is none, it is too old, or it is damaged. */
export function loadPostDraft(userId, scope, { now = Date.now(), storage = defaultStore() } = {}) {
  if (!userId || !storage) return null;
  try {
    const raw = storage.getItem(postDraftKey(userId, scope)); if (!raw) return null;
    const x = JSON.parse(raw);
    if (!x || typeof x.t !== 'number' || now - x.t > MAX_AGE || typeof x.d !== 'object' || x.d === null) { storage.removeItem(postDraftKey(userId, scope)); return null; }
    const d = {}; for (const k of FIELDS) if (typeof x.d[k] === 'string') d[k] = x.d[k];
    return isEmptyDraft(d) ? null : d;
  } catch { try { storage.removeItem(postDraftKey(userId, scope)); } catch { /* ignore */ } return null; }
}
