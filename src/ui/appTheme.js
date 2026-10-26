// appTheme.js: the whole app UI is coloured from the person's theme.
// A theme has 7 colours (bg, frame, card, border, text, link, accent). From those we compute the few values
// that need maths (readable text on a fill, light/dark, a legible accent) and publish them as CSS variables
// on <html>. Everything else (surfaces, hovers, muted text, shadows) is derived in ui-theme.css with color-mix().

/** Black & white default. New accounts, logged-out screens and broken/missing themes all fall back to this. */
export const MONO_COLORS = {
  accent_color: '#ffffff', border_color: '#2f2f2f', card_color: '#111111', frame_color: '#0a0a0a',
  text_color: '#f2f2f2', link_color: '#ffffff', bg_color: '#000000',
};

const parse = (h) => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h || '').trim());
  if (!m) return null;
  let s = m[1]; if (s.length === 3) s = [...s].map((c) => c + c).join('');
  const n = parseInt(s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = (rgb) => '#' + rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('');
const lum = ([r, g, b]) => { const f = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);

const BLACK = [0, 0, 0], WHITE = [255, 255, 255];
/** Fixed semantic colours: they never follow the theme. */
export const DANGER = '#d92d35';
export const VERIFIED_BLUE = '#1d9bf0';
/** Text colour for a button/badge/marker with this fill: pure white or pure black, whichever reads better. */
export const onColor = (rgb) => (contrast(rgb, BLACK) >= contrast(rgb, WHITE) ? '#000000' : '#ffffff');

/** Returns the CSS variables to set on <html> for a given theme object. */
export function appThemeVars(theme) {
  const t = theme || {};
  const pick = (k) => parse(t[k]) || parse(MONO_COLORS[k]);
  const bg = pick('bg_color'), frame = pick('frame_color'), card = pick('card_color'), border = pick('border_color');
  const text = pick('text_color'), link = pick('link_color'), accent = pick('accent_color');
  const dark = lum(bg) < 0.4;

  // Accent used as TEXT or an icon colour: nudge it toward the text colour until it is readable on the surfaces.
  const legible = (c, on) => { let v = c; for (let k = 0.05; contrast(v, on) < 3.2 && k <= 1; k += 0.05) v = mix(c, text, k); return v; };
  const accentFg = legible(accent, card);
  const linkFg = legible(link, card);

  // Semantic roles come from the theme too (no fixed yellow / red / green / pink).
  //   notice -> accent, success -> link. Errors and destructive actions are always red, whatever the theme (still marked with a ⚠).
  const notice = accent, good = link, like = accent;
  const danger = parse(DANGER);
  const dangerFg = parse(dark ? '#ff6b72' : '#c4242c');
  // Shadow tone: near-black on dark themes, the theme's own text colour on light ones (so lifts stay visible).
  const shade = dark ? mix(bg, BLACK, 0.7) : mix(text, BLACK, 0.2);

  return {
    '--t-bg': hex(bg), '--t-frame': hex(frame), '--t-card': hex(card), '--t-border': hex(border), '--t-text': hex(text), '--t-link': hex(link),
    '--accent': hex(accent), '--on-accent': onColor(accent), '--accent-fg': hex(accentFg), '--on-accent-fg': onColor(accentFg),
    '--link-fg': hex(linkFg),
    '--notice': hex(notice), '--on-notice': onColor(notice),
    '--green': hex(good), '--on-green': onColor(good),
    '--red': hex(danger), '--on-red': '#ffffff', '--red-fg': hex(dangerFg),
    '--pink': hex(like), '--on-pink': onColor(like),
    '--shade': hex(shade),
    '--scheme': dark ? 'dark' : 'light',
    '--map-filter': dark
      ? 'invert(1) hue-rotate(180deg) grayscale(1) brightness(.82) contrast(1.15)'
      : 'grayscale(1) brightness(1.02) contrast(.95)',
  };
}

/** Writes the variables onto <html> (so body, auth screen, modals and toasts are themed too). */
export function applyAppTheme(theme) {
  const root = document.documentElement; const v = appThemeVars(theme);
  for (const [k, x] of Object.entries(v)) root.style.setProperty(k, x);
  root.style.colorScheme = v['--scheme']; root.dataset.tone = v['--scheme'];
}
