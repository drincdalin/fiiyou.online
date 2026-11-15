// WCAG contrast maths for the profile customizer. Pure functions, no DOM, so they are easy to test.
// A theme's colours are plain #rrggbb strings; the card and the page frame can be see-through (card_opacity, frame_opacity),
// so the colour text really sits on is worked out by blending them, the same way the browser draws them.

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (h) => HEX.test(h || '');
const toRgb = (h) => { const n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const channel = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
export const luminance = (hex) => { const [r, g, b] = toRgb(hex); return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b); };

/** WCAG contrast ratio between two colours, 1 (identical) to 21 (black on white). */
export function contrast(a, b) {
  if (!isHex(a) || !isHex(b)) return 21;   // an unusable value is not reported as a contrast problem
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `top` drawn over `bottom` at this opacity (0 to 1). */
export const blend = (top, bottom, alpha) => {
  if (!isHex(top) || !isHex(bottom)) return isHex(bottom) ? bottom : top;
  const [t, b] = [toRgb(top), toRgb(bottom)]; const a = Math.max(0, Math.min(1, alpha));
  return toHex(t.map((v, i) => v * a + b[i] * (1 - a)));
};

/** The smallest change to `fg` (toward white or toward black, whichever needs less) that reaches `min` contrast on EVERY surface in `on`. */
export function readableOn(fg, on, min = 4.5) {
  const surfaces = [].concat(on).filter(isHex);
  if (!isHex(fg) || !surfaces.length) return fg;
  const worst = (c) => Math.min(...surfaces.map((s) => contrast(c, s)));
  const goal = min + 0.1;   // a little headroom so rounding never lands a hair under the limit
  if (worst(fg) >= goal) return fg;
  const towards = (end) => {
    for (let t = 0.02; t <= 1.0001; t += 0.02) { const c = blend(end, fg, t); if (worst(c) >= goal) return { c, t }; }
    return { c: end, t: 2, ratio: worst(end) };
  };
  const [w, k] = [towards('#ffffff'), towards('#000000')];
  if (w.t > 1 && k.t > 1) return w.ratio >= k.ratio ? '#ffffff' : '#000000';   // neither extreme reaches the goal: take the better one
  return w.t <= k.t ? w.c : k.c;
}

/**
 * Checks a full theme object. Returns the surfaces text lands on and one entry per check:
 *   { id, key, label, ratio, min, ok, fix }   (fix = a colour for `key` that passes, only when !ok)
 * Text must read on the cards AND on the page frame; links on the cards.
 */
export function themeContrast(theme, min = 4.5) {
  const t = theme || {};
  const bg = isHex(t.bg_color) ? t.bg_color : '#000000';
  const frame = blend(t.frame_color, bg, (+t.frame_opacity || 0) / 100);
  const card = blend(t.card_color, frame, (+t.card_opacity || 0) / 100);
  const frameShows = (+t.frame_opacity || 0) > 0;
  const textOn = frameShows ? [card, frame] : [card];
  const run = (id, key, label, on) => {
    const fg = t[key]; const ratio = Math.min(...on.map((s) => contrast(fg, s)));
    const ok = ratio >= min; return { id, key, label, ratio, min, ok, fix: ok ? null : readableOn(fg, on, min) };
  };
  return { surfaces: { frame, card }, checks: [run('text', 'text_color', 'Text', textOn), run('link', 'link_color', 'Links', [card])] };
}
