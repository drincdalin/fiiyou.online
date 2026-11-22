// profile.theme -> CSS vars. Allowed values mirror is_valid_theme() in 0006 — keep both in sync.
export const FONT_STACKS = {
  default: 'var(--ui-font)', ubuntu: '"Ubuntu Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', serif: 'Georgia, "Times New Roman", serif',
  mono: '"Ubuntu Sans Mono", ui-monospace, Menlo, Consolas, monospace', pixel: '"Courier New", monospace',
  verdana: 'Verdana, Geneva, sans-serif', comic: '"Comic Sans MS", "Comic Neue", cursive',
  custom: 'var(--ui-font)',   // the person's uploaded font (theme.font_file). themeStyle() swaps in the real family; this is only the fallback.
};
export const OPTIONS = {
  radius: ['0', '8', '12', '16', '24', '32'], step: ['4', '8', '12', '16'], border_width: ['0', '1', '2', '3', '4'],
  border_style: ['solid', 'dashed', 'dotted', 'double'], shadow: ['none', 'soft', 'hard'],
  frame_opacity: ['0', '25', '50', '70', '85', '100'], card_opacity: ['0', '50', '70', '85', '100'],
  blur: ['0', '4', '8', '16'], overlay: ['0', '20', '40', '60', '80'],
  font: Object.keys(FONT_STACKS), name_font: Object.keys(FONT_STACKS), font_size: ['13', '14', '15', '16', '18'], name_case: ['upper', 'normal'],
  layout: ['side-left', 'side-right', 'single'], sidebar: ['160', '190', '240'], card_gap: ['8', '16', '24', '32'],
  bg_repeat: ['cover', 'repeat', 'repeat-x', 'repeat-y', 'no-repeat'], bg_fixed: ['fixed', 'scroll'], cursor: ['default', 'crosshair', 'pointer', 'help'],
};
export const COLOR_KEYS = ['accent_color', 'border_color', 'card_color', 'frame_color', 'text_color', 'link_color', 'bg_color'];
export const GROUPS = [['Shape', ['radius', 'step', 'border_width', 'border_style', 'shadow']],
  ['Surface', ['frame_opacity', 'card_opacity', 'blur', 'overlay']], ['Type', ['font', 'name_font', 'font_size', 'name_case']],
  ['Layout', ['layout', 'sidebar', 'card_gap']], ['Background', ['bg_repeat', 'bg_fixed', 'cursor']]];
export const THEME_DEFAULTS = {
  accent_color: '#b3121b', border_color: '#6e1015', card_color: '#141414', frame_color: '#000000', text_color: '#f2f2f2',
  link_color: '#ff5a62', bg_color: '#0b0b0b', radius: '24', step: '8', border_width: '1', border_style: 'solid', shadow: 'none',
  frame_opacity: '70', card_opacity: '100', blur: '4', overlay: '60', font: 'ubuntu', name_font: 'ubuntu', font_size: '15',
  name_case: 'upper', layout: 'side-left', sidebar: '190', card_gap: '24', bg_repeat: 'cover', bg_fixed: 'fixed', cursor: 'default',
};
// Nested radii: every level inside another subtracts `step` (24 -> 16 -> 8 by default).
export const radii = (t) => { const m = { ...THEME_DEFAULTS, ...t }, r = +m.radius, s = +m.step;
  return [r, Math.max(0, r - s), Math.max(0, r - 2 * s)]; };
/** fontFamily = CSS family name returned by loadFont() for theme.font_file (null while loading or if it failed). */
export function themeStyle(t = {}, bgUrl = null, fontFamily = null) {
  const m = { ...THEME_DEFAULTS, ...t };
  const stack = (k) => (k === 'custom' ? (fontFamily ? `"${fontFamily}", ${FONT_STACKS.default}` : FONT_STACKS.default) : FONT_STACKS[k]);
  return {
    '--accent': m.accent_color, '--on-accent': onColor(m.accent_color), '--border': m.border_color, '--card': m.card_color, '--text': m.text_color, '--link': m.link_color,
    '--r1': m.radius + 'px', '--step': m.step + 'px', '--bw': m.border_width + 'px', '--bs': m.border_style,
    '--frame': `color-mix(in srgb, ${m.frame_color} ${m.frame_opacity}%, transparent)`,
    '--card-bg': `color-mix(in srgb, ${m.card_color} ${m.card_opacity}%, transparent)`,
    '--shadow': { none: 'none', soft: '0 10px 30px rgba(0,0,0,.45)', hard: '6px 6px 0 var(--border)' }[m.shadow],
    '--blur': m.blur + 'px', '--overlay': m.overlay / 100, '--fs': m.font_size + 'px', '--sidebar': m.sidebar + 'px',
    '--gap': m.card_gap + 'px', '--ncase': m.name_case === 'upper' ? 'uppercase' : 'none',
    '--font': stack(m.font), '--name-font': stack(m.name_font), cursor: m.cursor, backgroundColor: m.bg_color,
    backgroundAttachment: m.bg_fixed,
    ...(bgUrl ? { backgroundImage: `url(${bgUrl})`, backgroundRepeat: m.bg_repeat === 'cover' ? 'no-repeat' : m.bg_repeat,
                  backgroundSize: m.bg_repeat === 'cover' ? 'cover' : 'auto', backgroundPosition: 'center' } : {}),
  };
}

const rgb = (hex) => { const n = parseInt(hex.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
/** Text colour that stays readable ON a fill of this colour: whichever of black/white contrasts more. */
export const onColor = (hex) => (/^#[0-9a-f]{6}/i.test(hex || '') && lum(rgb(hex)) > 0.179 ? '#000' : '#fff');
/** The person's accent is used EXACTLY for fills and borders. --accent-fg is only for accent-coloured TEXT on dark surfaces. */
export function appAccent(hex) {
  const h = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : THEME_DEFAULTS.accent_color; const c = rgb(h);
  const fg = lum(c) < 0.14 ? c.map((v) => Math.round(v + (255 - v) * 0.55)) : c;
  return { '--accent': h, '--on-accent': onColor(h), '--accent-fg': `rgb(${fg.join(' ')})` };
}
