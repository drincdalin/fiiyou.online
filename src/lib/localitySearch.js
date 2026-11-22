// Pure helpers for the locality picker (no React, so they can be unit-tested with node --test).
export const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[șş]/g, 's').replace(/[țţ]/g, 't');
const RECENT_KEY = 'fiiyou:recentLocs';
export const readRecent = () => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
export const writeRecent = (id) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([String(id), ...readRecent().filter((x) => x !== String(id))].slice(0, 5))); } catch { /* private mode: no recents, nothing breaks */ } };
const MAX_SHOWN = 60;

/** Pure and exported so it can be tested: the rows to show for a query. */
export function searchLocalities(locs, query, { pinnedIds = [], recentIds = [], emptyLabel = '' } = {}) {
  const q = norm(query).trim();
  if (!q) {
    const byId = new Map(locs.map((l) => [String(l.id), l])); const seen = new Set(); const out = [];
    if (emptyLabel) out.push({ kind: 'empty', label: emptyLabel });
    const add = (ids, group) => { const rows = ids.map((i) => byId.get(String(i))).filter((l) => l && !seen.has(l.id)); if (!rows.length) return; out.push({ kind: 'group', label: group }); rows.forEach((l) => { seen.add(l.id); out.push({ kind: 'loc', l }); }); };
    add(pinnedIds, 'Your place'); add(recentIds, 'Recent');
    return { rows: out, total: locs.length, more: locs.length };
  }
  const words = q.split(/\s+/);
  const scored = [];
  for (const l of locs) {
    const n = l._n ?? norm(l.name), c = l._c ?? norm(l.commune);
    if (!words.every((w) => n.includes(w) || c.includes(w))) continue;
    const s = n === q ? 0 : n.startsWith(q) ? 1 : n.split(/[\s()-]+/).some((p) => p.startsWith(words[0])) ? 2 : n.includes(words[0]) ? 3 : 4;   // exact, starts with, a word starts with, contains, only the commune matches
    scored.push([s, l]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name, 'ro'));
  return { rows: scored.slice(0, MAX_SHOWN).map(([, l]) => ({ kind: 'loc', l })), total: scored.length, more: Math.max(0, scored.length - MAX_SHOWN) };
}

