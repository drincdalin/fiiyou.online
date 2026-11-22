/* Autosave for the profile editor. The draft lives in this browser's localStorage (never sent anywhere) so a refresh, a crash or a
 * dropped connection does not throw away a half-finished theme. It is removed when the editor is saved or discarded. */
const PREFIX = 'fiiyou_draft_';
const VERSION = 1;
export const MAX_AGE = 24 * 3600e3;   // older drafts are ignored and deleted
const MEDIA_PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,80}$/;   // same shape the database accepts for storage paths

const defaultStore = () => { try { return globalThis.localStorage || null; } catch { return null; } };
export const draftKey = (userId) => PREFIX + userId;

export function saveDraft(userId, draft, { now = Date.now(), storage = defaultStore() } = {}) {
  if (!storage || !userId || !draft) return false;
  try { storage.setItem(draftKey(userId), JSON.stringify({ v: VERSION, t: now, draft })); return true; } catch { return false; }   // quota or private mode: just skip
}

export function clearDraft(userId, { storage = defaultStore() } = {}) {
  try { storage?.removeItem(draftKey(userId)); } catch { /* ignore */ }
}

/** -> { t, draft } or null. Anything malformed or older than MAX_AGE is deleted. */
export function loadDraft(userId, { now = Date.now(), storage = defaultStore() } = {}) {
  if (!storage || !userId) return null;
  let raw; try { raw = storage.getItem(draftKey(userId)); } catch { return null; }
  if (!raw) return null;
  try {
    const x = JSON.parse(raw);
    const ok = x && x.v === VERSION && typeof x.t === 'number' && now - x.t <= MAX_AGE && now - x.t >= -60e3
      && x.draft && typeof x.draft === 'object' && Array.isArray(x.draft.cards) && x.draft.theme && typeof x.draft.theme === 'object';
    if (ok) return { t: x.t, draft: x.draft };
  } catch { /* fall through */ }
  clearDraft(userId, { storage });
  return null;
}

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

/** Puts a stored draft on top of a FRESH draft built from the saved profile (what makeDraft returns).
 *  Cards created or deleted since the draft was written are reconciled; the "orig*" bookkeeping always comes from the fresh draft,
 *  so saving or discarding still cleans up the right files. */
export function mergeDraft(stored, fresh) {
  const byId = new Map(fresh.cards.map((c) => [c.id, c])); const seen = new Set(); const cards = [];
  for (const c of Array.isArray(stored.cards) ? stored.cards : []) {
    if (!isObj(c) || typeof c.id !== 'string' || !byId.has(c.id) || seen.has(c.id)) continue;   // deleted since: drop it
    cards.push({ ...byId.get(c.id), ...c }); seen.add(c.id);
  }
  for (const c of fresh.cards) if (!seen.has(c.id)) cards.push(c);                             // created since: keep it
  const fields = { ...fresh.fields };
  if (isObj(stored.fields)) for (const k of Object.keys(fresh.fields)) if (k in stored.fields) fields[k] = stored.fields[k];
  return {
    ...fresh, cards, fields,
    theme: isObj(stored.theme) ? { ...stored.theme } : fresh.theme,
    css: Array.isArray(stored.css) ? stored.css : fresh.css,
    top: Array.isArray(stored.top) && stored.top.every((i) => typeof i === 'string') ? stored.top : fresh.top,
  };
}

/** Every storage path mentioned in the saved draft. The orphan sweep must not delete these while the draft exists. */
export function draftMediaPaths(userId, { now = Date.now(), storage = defaultStore() } = {}) {
  const out = new Set(); const d = loadDraft(userId, { now, storage })?.draft; if (!d) return out;
  const walk = (x, depth = 0) => {
    if (depth > 8) return;
    if (typeof x === 'string') { if (MEDIA_PATH.test(x)) out.add(x); } else if (Array.isArray(x)) x.forEach((v) => walk(v, depth + 1)); else if (isObj(x)) Object.values(x).forEach((v) => walk(v, depth + 1));
  };
  walk(d); return out;
}
