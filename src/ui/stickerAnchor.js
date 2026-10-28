// stickerAnchor.js: stickers are pinned to an ANCHOR, not to the page.
//
// Anchors: every card on the page, plus the avatar (so a bow on the photo stays on the photo on phones too).
// A sticker stores:  content.at = { card: <card id | 'avatar' | null>, v: 't' | 'b' }   and   x, y, w, h  in "units".
//   1 unit = 1/1000 of the ANCHOR's own width (a card is as wide as the cards column, the avatar as wide as the avatar),
//   so a sticker scales together with the thing it sits on, on every screen.
//   x = distance from the anchor's left edge.
//   y = distance from the anchor's top edge (v:'t') or from its bottom edge, upwards (v:'b').
//   Negative values and values past the anchor are fine: that is how a sticker hangs into the margins.
// Stickers saved before this existed have no `at`. They are converted on the fly (stickerModel) and saved in the new form the first time they are touched.
import { THEME_DEFAULTS } from './theme.js';

export const UNITS = 1000;
export const POS_MAX = 30000;   // far enough that a sticker placed anywhere on the page is never pushed back towards its anchor
export const AVATAR = 'avatar';
export const FRAME = 'frame';   // the whole bordered page box: stickers outside the border are pinned to it
const FRAME_W = 1210;    // the old coordinate space: the 1210px profile frame

/** The old 1210px frame: where the cards column and the avatar were (only used to convert old stickers). */
function legacyBox(theme) {
  const t = { ...THEME_DEFAULTS, ...(theme || {}) };
  const step = +t.step || 8, gap = Math.max(+t.card_gap || 24, 20), side = +t.sidebar || 190, pad = Math.max(step * 3, 20);
  const layout = t.layout || 'side-left', rail = layout === 'single' ? 0 : side + 1 + gap * 2;
  const colW = FRAME_W - pad * 2 - rail, colLeft = layout === 'side-left' ? pad + rail : pad;
  return { layout, colLeft, colW, top: pad, av: { left: layout === 'side-right' ? FRAME_W - pad - side : pad, top: pad, w: side, h: Math.round(side * 1.2) } };
}

/** Position and size of a sticker card row, always in anchored units. */
export function stickerModel(c, theme) {
  const at = c.content?.at;
  if (at) return { card: at.card || null, v: at.v === 'b' ? 'b' : 't', x: c.x, y: c.y, w: c.w, h: c.h };
  const b = legacyBox(theme), cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  const onSide = b.layout === 'single' ? cy < b.av.top + b.av.h : b.layout === 'side-left' ? cx < b.colLeft : cx > b.colLeft + b.colW;
  if (onSide) { const s = UNITS / b.av.w; return { card: AVATAR, v: 't', x: Math.round((c.x - b.av.left) * s), y: Math.round((c.y - b.av.top) * s), w: Math.round(c.w * s), h: Math.round(c.h * s) }; }
  const s = UNITS / b.colW;
  return { card: null, v: 't', x: Math.round((c.x - b.colLeft) * s), y: Math.round((c.y - b.top) * s), w: Math.round(c.w * s), h: Math.round(c.h * s) };
}

/** Column patch for a card row after applying a change (any of card, v, x, y, w, h) to the sticker's model. */
export function withModel(c, theme, change) {
  const m = { ...stickerModel(c, theme), ...change };
  return { x: m.x, y: m.y, w: m.w, h: m.h, content: { ...c.content, at: { card: m.card, v: m.v } } };
}

/** Inline style: sizes are multiples of --u (px per unit of the anchor), which ProfileView measures and sets on the page. */
export const stickerStyle = (c, m, unit) => ({
  '--u': unit ? `${unit}px` : m.card === AVATAR ? 'var(--u-avatar, 1px)' : 'var(--u-cards, 1px)',
  '--sx': `calc(var(--u) * ${m.x})`, '--sw': `calc(var(--u) * ${m.w})`,   // left comes from CSS (.sticker), which keeps a sticker on screen on narrow layouts
  [m.v === 'b' ? 'bottom' : 'top']: `calc(var(--u) * ${m.y})`,
  width: `calc(var(--u) * ${m.w})`, height: `calc(var(--u) * ${m.h})`, zIndex: 100 + (c.z || 0), transform: `rotate(${c.rotation || 0}deg)`,
});

/** Sidebar anchors (avatar, name box, music player, buttons). Their stickers all use ONE unit: the avatar's width
 *  (the sidebar's width if the avatar is hidden). Those boxes are as wide as the sidebar on a desktop but as wide as
 *  the whole screen on a phone, so measuring each by its own width would blow a sticker up several times over. */
export const SIDE_ANCHORS = new Set([AVATAR, 'nameplate', 'player', 'actions']);

/** px per unit of an anchor. node = the anchor element (optional). */
export function anchorUnit(root, id, node) {
  const w = (n) => n?.getBoundingClientRect().width || 0;
  if (SIDE_ANCHORS.has(id)) return (w(root.querySelector(`[data-cid="${AVATAR}"]`)) || w(root.querySelector('.side'))) / UNITS;
  if (id === FRAME) return w(root) / UNITS;
  return w(node || root.querySelector(`[data-cid="${CSS.escape(id || '')}"]`) || root.querySelector('.cards')) / UNITS;
}

/** px per unit of every anchor currently on the page: { anchorId: px }. */
export function unitsOf(root) {
  const out = {};
  anchorNodes(root).forEach((n) => { out[n.dataset.cid] = anchorUnit(root, n.dataset.cid, n); });
  return out;
}

/** Width of every anchor in ITS OWN sticker units: { anchorId: units }. A sticker whose centre lies beyond 0..width has been
 *  hung outside its anchor (into the page margin); on a phone it can only be shown as a sliver at the edge. */
export function spansOf(root) {
  const out = {};
  anchorNodes(root).forEach((n) => { const u = anchorUnit(root, n.dataset.cid, n); out[n.dataset.cid] = u ? Math.round(n.getBoundingClientRect().width / u) : UNITS; });
  return out;
}

/** The anchor (avatar or card) nearest to a point (cx, cy) on screen. only = restrict to one anchor id. Returns { n, b } (element + rect) or null. */
const anchorNodes = (root) => [root, ...root.querySelectorAll('[data-cid]')].filter((n) => n.dataset.cid);

export function nearestTo(root, cx, cy, only) {
  const nodes = anchorNodes(root).filter((n) => !only || n.dataset.cid === only);
  let best = null, gap = Infinity;
  for (const n of nodes) {
    const b = n.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) continue;   // hidden anchors do not count
    if (n === root && !only && cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) continue;   // the frame only takes stickers that sit OUTSIDE its border
    const d = Math.hypot(cx < b.left ? b.left - cx : cx > b.right ? cx - b.right : 0, cy < b.top ? b.top - cy : cy > b.bottom ? cy - b.bottom : 0);
    if (d < gap) { gap = d; best = { n, b }; }
  }
  return best;
}

/** Same, for a sticker element (its centre; rotation is about the centre, so the centre is the same as unrotated). */
export function nearestAnchor(el, root, only) {
  const r = el.getBoundingClientRect();
  return nearestTo(root, r.left + r.width / 2, r.top + r.height / 2, only);
}

/** Pin a box (centre cx, cy and size wpx x hpx, all in screen px) to the nearest anchor (or to `only`).
 *  Returns { card, v, x, y, w, h } in that anchor's units, or null. */
export function pinBox(root, cx, cy, wpx, hpx, only) {
  const hit = nearestTo(root, cx, cy, only);
  if (!hit) return null;
  const { n, b } = hit, u2 = anchorUnit(root, n.dataset.cid, n), left = cx - wpx / 2, top = cy - hpx / 2;
  if (!u2) return null;
  // stickers are positioned from the anchor's PADDING box (inside its border)
  const pl = b.left + n.clientLeft, pt = b.top + n.clientTop, pb = pt + n.clientHeight;
  const v = cy > (pt + pb) / 2 ? 'b' : 't', cl = (n2, lo, hi) => Math.min(hi, Math.max(lo, Math.round(n2)));
  return { card: n.dataset.cid, v, x: cl((left - pl) / u2, -POS_MAX, POS_MAX), y: cl((v === 'b' ? pb - (top + hpx) : top - pt) / u2, -POS_MAX, POS_MAX),
    w: cl(wpx / u2, 40, 1200), h: cl(hpx / u2, 40, 2000) };
}

/** Attach the sticker to the nearest anchor (or to `only`). unit = px per unit of its CURRENT anchor.
 *  Returns { card, v, x, y, w, h } (size is recomputed so it keeps the same size and place on screen) or null. */
export function reanchor(el, root, m, unit, only) {
  if (!unit) return null;
  const r = el.getBoundingClientRect();
  return pinBox(root, r.left + r.width / 2, r.top + r.height / 2, m.w * unit, m.h * unit, only);
}

/** True when "what is this sticker visually sitting on?" gives a trustworthy answer: the sidebar is NEXT TO the cards (desktop),
 *  or the theme is 'single' (always stacked, so always the same). On a tablet or phone the sidebar is stacked above the cards,
 *  so re-pinning by position there would attach desktop stickers to the wrong anchors and save that. Measured from the DOM,
 *  not from window.innerWidth, so it also holds when the customizer panel narrows the page. */
export function layoutIsStable(root, theme) {
  if ((theme?.layout || 'side-left') === 'single') return true;
  const side = root.querySelector('.side'), cards = root.querySelector('.cards');
  if (!side || !cards) return false;
  const s = side.getBoundingClientRect(), c = cards.getBoundingClientRect();
  return s.right <= c.left + 2 || c.right <= s.left + 2;
}

/** True when a sticker is not pinned to anything that is on the page (no card, or its card is hidden / deleted / the music card). */
export const isStray = (m, root) => m.card !== AVATAR && m.card !== FRAME && !(m.card && root.querySelector(`[data-cid="${CSS.escape(m.card)}"]`));

/** Stray stickers used to be drawn relative to the whole frame (the cards column had no position of its own), which is
 *  why they drifted away from their card on other screen sizes. Work out where such a sticker was drawn on this (desktop)
 *  screen and pin it to the card it sits on. Returns a change for withModel, or null. */
export function pinStray(c, theme, root) {
  if (!layoutIsStable(root, theme)) return null;
  const m = stickerModel(c, theme);
  if (!isStray(m, root)) return null;
  const cards = root.querySelector('.cards'); if (!cards) return null;
  const u = cards.getBoundingClientRect().width / UNITS, f = root.getBoundingClientRect();
  const left = f.left + root.clientLeft + m.x * u, wpx = m.w * u, hpx = m.h * u;
  const top = m.v === 'b' ? f.top + root.clientTop + root.clientHeight - m.y * u - hpx : f.top + root.clientTop + m.y * u;
  return pinBox(root, left + wpx / 2, top + hpx / 2, wpx, hpx);
}

/** px per unit of the anchor this sticker element currently sits in. */
const unitOf = (el, root) => { const a = el.closest('[data-cid]'); return a ? anchorUnit(root, a.dataset.cid, a) : anchorUnit(root, null); };

/** Customizer "Pinned to": move a sticker onto a chosen anchor without moving it on screen. Returns a change for withModel, or null. */
export function pinTo(c, targetId, theme) {
  const el = document.querySelector(`[data-sid="${c.id}"]`), root = el?.closest('.frame');
  return el && root ? reanchor(el, root, stickerModel(c, theme), unitOf(el, root), targetId) : null;
}

/** When editing starts: re-pin a sticker to what it visually sits on (fixes stickers saved against another element). Returns a change or null. */
export function settleSticker(c, theme, root) {
  if (!layoutIsStable(root, theme)) return null;
  const el = root.querySelector(`[data-sid="${c.id}"]`); if (!el) return null;
  const m = stickerModel(c, theme), at = reanchor(el, root, m, unitOf(el, root));
  return !at || (c.content?.at && at.card === m.card && at.v === m.v) ? null : at;
}

/** A sticker whose centre is no longer over the anchor it is pinned to (it hangs off into empty space, e.g. far below the avatar)
 *  is moved to the nearest anchor, keeping its place and size on screen. Returns a change for withModel, or null. */
export function rehome(c, theme, root) {
  if (!layoutIsStable(root, theme)) return null;
  const el = root.querySelector(`[data-sid="${c.id}"]`), cur = el?.closest('[data-cid]'); if (!el || !cur) return null;
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, b = cur.getBoundingClientRect();
  if (cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) return null;
  const m = stickerModel(c, theme), at = reanchor(el, root, m, unitOf(el, root));
  return at && at.card !== m.card ? at : null;
}
