import { COLOR_KEYS, OPTIONS } from './theme.js';
import { SELECTORS, PROPS, valid } from './customCss.js';
// Imported files are untrusted: every value is re-validated here, and the database re-checks it again on save.
const HEX = /^#[0-9a-fA-F]{6}$/; const CARD_TYPES = ['about', 'text', 'links', 'interests', 'guestbook', 'top_friends', 'gallery'];
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

export function sanitizeTheme(t) {
  const out = {}; if (!t || typeof t !== 'object') return out;
  t = { ...t, font: t.font === 'endless' ? 'ubuntu' : t.font, name_font: t.name_font === 'endless' ? 'ubuntu' : t.name_font };   // themes exported before the font change
  for (const k of COLOR_KEYS) if (HEX.test(t[k])) out[k] = t[k];            // bg_image is never imported: that file lives in another account
  for (const [k, opts] of Object.entries(OPTIONS)) if (opts.includes(String(t[k]))) out[k] = String(t[k]);
  return out;
}
export function sanitizeCss(rules) {
  if (!Array.isArray(rules)) return [];
  return rules.filter((r) => SELECTORS[r?.s] && r.p && typeof r.p === 'object').slice(0, 40)
    .map((r) => ({ s: r.s, p: Object.fromEntries(Object.entries(r.p).filter(([k, v]) => valid(PROPS[k], v)).slice(0, 12)) })).filter((r) => Object.keys(r.p).length);
}
export function sanitizeCards(cards) {
  if (!Array.isArray(cards)) return [];
  return [...cards].filter((c) => CARD_TYPES.includes(c?.type)).sort((a, b) => (Number(a.y) || 0) - (Number(b.y) || 0)).slice(0, 30).map((c) => {
    const k = c.content && typeof c.content === 'object' ? c.content : {}; let content = {};
    if (c.type === 'about' || c.type === 'text') content = { body: str(k.body, 3000) };
    if (c.type === 'links') content = { links: (Array.isArray(k.links) ? k.links : []).filter((l) => typeof l?.url === 'string' && /^https?:\/\/\S+$/.test(l.url) && l.url.length <= 500).slice(0, 20).map((l) => ({ label: str(l.label, 60), url: l.url })) };
    if (c.type === 'interests') content = { interests: (Array.isArray(k.interests) ? k.interests : []).filter((s) => typeof s === 'string').slice(0, 30).map((s) => s.slice(0, 40)) };
    return { type: c.type, title: str(c.title, 60) || c.type.replace('_', ' '), visible: c.visible !== false, content };
  });
}
/** Accepts a theme export OR a full "Export all my data" file. */
export function parseThemeFile(text) {
  let j; try { j = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  if (!j || typeof j !== 'object') throw new Error('That file is not a fiiyou export.');
  const src = j.profile && typeof j.profile === 'object' ? j.profile : j;
  const out = { theme: sanitizeTheme(src.theme ?? j.theme), css: sanitizeCss(src.custom_css ?? j.custom_css), cards: sanitizeCards(j.cards) };
  if (!Object.keys(out.theme).length && !out.css.length && !out.cards.length) throw new Error('Nothing importable was found in that file.');
  return out;
}
export const buildThemeExport = (profile, cards) => ({ fiiyou_theme: 1, exported_at: new Date().toISOString(),
  theme: sanitizeTheme(profile.theme), custom_css: sanitizeCss(profile.custom_css), cards: sanitizeCards(cards) });
export function download(name, obj) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
