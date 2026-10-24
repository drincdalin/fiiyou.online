// Maps profile.theme (validated in SQL, see 0005) -> CSS variables. One source of truth for looks.
export const FONT_STACKS = {
  default: 'var(--ui-font)',
  endless: '"Endless", system-ui, "Segoe UI", Roboto, sans-serif',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, Menlo, Consolas, monospace',
  pixel: '"Courier New", monospace',
  verdana: 'Verdana, Geneva, sans-serif',
  comic: '"Comic Sans MS", "Comic Neue", cursive',
};
export const THEME_DEFAULTS = {
  accent_color: '#b3121b', border_color: '#6e1015', card_color: '#141414', text_color: '#f2f2f2',
  link_color: '#ff5a62', bg_color: '#0b0b0b', font: 'endless', name_font: 'endless',
  radius: '2', overlay: '60', bg_repeat: 'cover', cursor: 'default',
};
export const OPTIONS = {
  font: Object.keys(FONT_STACKS), name_font: Object.keys(FONT_STACKS),
  radius: ['0', '2', '4', '8', '12', '20'], overlay: ['0', '20', '40', '60', '80'],
  bg_repeat: ['cover', 'repeat', 'repeat-x', 'repeat-y', 'no-repeat'], cursor: ['default', 'crosshair', 'pointer', 'help'],
};
export function themeStyle(t = {}, bgUrl = null) {
  const m = { ...THEME_DEFAULTS, ...t };
  return {
    '--accent': m.accent_color, '--border': m.border_color, '--card': m.card_color, '--text': m.text_color,
    '--link': m.link_color, '--page': m.bg_color, '--radius': m.radius + 'px', '--overlay': m.overlay / 100,
    '--font': FONT_STACKS[m.font], '--name-font': FONT_STACKS[m.name_font], cursor: m.cursor,
    backgroundColor: m.bg_color,
    ...(bgUrl ? { backgroundImage: `url(${bgUrl})`, backgroundRepeat: m.bg_repeat === 'cover' ? 'no-repeat' : m.bg_repeat,
                  backgroundSize: m.bg_repeat === 'cover' ? 'cover' : 'auto' } : {}),
  };
}
