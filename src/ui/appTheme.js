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

/** Smallest nudge of `c` toward `toward` that reaches `min` contrast on EVERY surface in `on` (a text colour that has to be read on the
 *  page, the cards, the hover fill...). Stops at `toward` itself if even that is not enough, so it always terminates. */
const ensure = (c, on, min, toward) => {
  const goal = min + 0.12;   // a little headroom, so rounding never lands a hair under the limit
  let v = c;
  for (let k = 0.02; k <= 1.0001 && on.some((s) => contrast(v, s) < goal); k += 0.02) v = mix(c, toward, k);
  return v;
};
/** Pure black or pure white, whichever reads better on the WORST of these surfaces (a light theme can still have a dark page behind it). */
const bestExtreme = (on) => (Math.min(...on.map((s) => contrast(BLACK, s))) >= Math.min(...on.map((s) => contrast(WHITE, s))) ? BLACK : WHITE);

/** Returns the CSS variables to set on <html> for a given theme object.
 *  Every colour that is used as TEXT (muted, secondary, accent, link, error) is checked here against the surfaces it really sits on,
 *  so all themes (including the ones people make themselves) reach WCAG AA 4.5:1, and form borders reach the 3:1 non-text minimum. */
export function appThemeVars(theme) {
  const t = theme || {};
  const pick = (k) => parse(t[k]) || parse(MONO_COLORS[k]);
  const bg = pick('bg_color'), frame = pick('frame_color'), card = pick('card_color'), border = pick('border_color');
  const text = pick('text_color'), link = pick('link_color'), accent = pick('accent_color');
  const dark = lum(bg) < 0.4;

  // The surfaces text can land on (same maths as the color-mix() rules in ui-theme.css).
  const g2 = mix(card, text, 0.14), hover = mix(card, text, 0.2);
  let surfaces = [bg, frame, card, g2, hover];
  // A theme whose page colour and card colour are on opposite sides (teal page, silver cards) has no single text colour for both:
  // text lives on the cards and the frame, so those win and the bare page background is left out.
  if (Math.min(...surfaces.map((s) => contrast(bestExtreme(surfaces), s))) < 4.6) surfaces = [frame, card, g2, hover];

  // Body text and secondary text: never below 4.5:1 on any of them.
  const ink = ensure(text, surfaces, 4.5, bestExtreme(surfaces));
  const ink2 = ensure(mix(bg, ink, 0.8), surfaces, 4.5, ink);
  const muted = ensure(mix(bg, ink, 0.7), surfaces, 4.5, ink);

  // Accent / link used as TEXT or an icon: nudge toward the text colour until it is readable on the surfaces.
  const accentFg = ensure(accent, surfaces, 4.5, ink);
  const linkFg = ensure(link, surfaces, 4.5, ink);

  // Semantic roles come from the theme too (no fixed yellow / red / green / pink).
  //   notice -> accent, success -> link. Errors and destructive actions are always red, whatever the theme (still marked with a ⚠).
  const notice = accent, good = link, like = accent;
  const danger = parse(DANGER);
  const dangerFg = ensure(parse(dark ? '#ff6b72' : '#c4242c'), surfaces, 4.5, bestExtreme(surfaces));
  // Shadow tone: near-black on dark themes, the theme's own text colour on light ones (so lifts stay visible).
  const shade = dark ? mix(bg, BLACK, 0.7) : mix(text, BLACK, 0.2);
  // Form fields need a visible edge (3:1 against what is behind them); decorative dividers keep the softer --t-border.
  const field = ensure(border, [bg, card], 3, ink);

  return {
    '--t-bg': hex(bg), '--t-frame': hex(frame), '--t-card': hex(card), '--t-border': hex(border), '--t-text': hex(ink), '--t-link': hex(link),
    '--accent': hex(accent), '--on-accent': onColor(accent), '--accent-fg': hex(accentFg), '--on-accent-fg': onColor(accentFg),
    '--link-fg': hex(linkFg),
    '--muted': hex(muted), '--ink2': hex(ink2), '--field-border': hex(field),
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
  // the phone's browser bar and the installed app's title bar take the page colour too
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', v['--t-frame']);
}
