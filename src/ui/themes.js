import { THEME_DEFAULTS } from './theme.js';
import { MONO_COLORS as M } from './appTheme.js';

// Ready-made themes. Every value is valid for the database check (see is_valid_theme); users can tweak anything afterwards.
const shape = { radius: '24', step: '8', border_width: '1', border_style: 'solid', shadow: 'none', frame_opacity: '70', card_opacity: '100', blur: '4', overlay: '60',
  font: 'ubuntu', name_font: 'ubuntu', font_size: '15', name_case: 'upper', layout: 'side-left', sidebar: '190', card_gap: '24', bg_repeat: 'cover', bg_fixed: 'fixed', cursor: 'default' };
const T = (id, name, c, extra = {}) => ({ id, name, theme: { ...THEME_DEFAULTS, ...shape, accent_color: c[0], border_color: c[1], card_color: c[2], frame_color: c[3], text_color: c[4], link_color: c[5], bg_color: c[6], ...extra } });
//                                        accent     border     card       frame      text       link       page bg
export const PRESETS = [

  // ---- Default: black & white. Every colour in the app UI is derived from the theme, so this makes the whole UI monochrome ----
  T('mono',        'Mono',           [M.accent_color, M.border_color, M.card_color, M.frame_color, M.text_color, M.link_color, M.bg_color],
    { radius: '14', step: '8', border_width: '2', shadow: 'none', frame_opacity: '100', card_opacity: '100', blur: '0', overlay: '0', name_case: 'normal', card_gap: '20' }),

  // ---- Statement themes ----
  T('aero',        'Frutiger Aero',  ['#3bb54a', '#ffffff', '#ffffff', '#bfe9fa', '#0e3a52', '#0f7cc0', '#58bfe8'],
    { radius: '28', step: '10', border_width: '2', shadow: 'soft', frame_opacity: '45', card_opacity: '58', blur: '20', overlay: '0', name_case: 'normal', font_size: '15', card_gap: '22' }),
  T('terminal',    'Terminal',       ['#4af626', '#1c3b1c', '#0a0d0a', '#050705', '#c9d1c9', '#7ee787', '#000000'],
    { radius: '0', step: '4', border_width: '1', shadow: 'none', frame_opacity: '92', card_opacity: '100', blur: '0', overlay: '85', font: 'mono', name_font: 'mono', font_size: '14', name_case: 'normal', card_gap: '14' }),
  T('goth',        'Goth',           ['#8a1c32', '#2b1820', '#0d0809', '#050304', '#d6cdc4', '#b0586c', '#020102'],
    { radius: '0', step: '10', border_width: '1', shadow: 'none', frame_opacity: '94', blur: '2', overlay: '82', font: 'serif', name_font: 'serif', font_size: '16', name_case: 'upper', card_gap: '36' }),

  // ---- Editor palettes ----
  T('tokyo',       'Tokyo Night',    ['#7aa2f7', '#3b4261', '#24283b', '#16161e', '#c0caf5', '#bb9af7', '#1a1b26'],
    { radius: '14', step: '8', border_width: '1', shadow: 'soft', frame_opacity: '88', blur: '6', overlay: '55', name_case: 'normal' }),
  T('catppuccin',  'Catppuccin',     ['#cba6f7', '#45475a', '#181825', '#11111b', '#cdd6f4', '#89b4fa', '#1e1e2e'],
    { radius: '20', step: '8', border_width: '2', shadow: 'soft', frame_opacity: '85', blur: '8', overlay: '50', name_case: 'normal', card_gap: '22' }),
  T('rosepine',    'Rosé Pine',      ['#ebbcba', '#403d52', '#1f1d2e', '#16141f', '#e0def4', '#9ccfd8', '#191724'],
    { radius: '16', step: '8', border_width: '1', shadow: 'none', frame_opacity: '85', blur: '6', overlay: '55', name_case: 'normal', name_font: 'serif', card_gap: '26' }),
  T('gruvbox',     'Gruvbox',        ['#fe8019', '#504945', '#282828', '#1d2021', '#ebdbb2', '#8ec07c', '#1d2021'],
    { radius: '4', step: '8', border_width: '2', shadow: 'hard', frame_opacity: '95', blur: '0', overlay: '70', font: 'mono', name_font: 'mono', font_size: '14', name_case: 'normal', card_gap: '20' }),
  T('nord',        'Nord',           ['#88c0d0', '#434c5e', '#3b4252', '#2e3440', '#eceff4', '#81a1c1', '#2e3440'],
    { radius: '10', step: '8', border_width: '1', shadow: 'soft', frame_opacity: '85', blur: '6', overlay: '55', name_case: 'normal' }),

  // ---- Retro / loud ----
  T('desktop98',   'Desktop 98',     ['#000080', '#808080', '#c0c0c0', '#c0c0c0', '#000000', '#0000ee', '#008080'],
    { radius: '0', step: '4', border_width: '2', shadow: 'hard', frame_opacity: '100', blur: '0', overlay: '0', font: 'mono', name_font: 'mono', font_size: '13', name_case: 'normal', card_gap: '12' }),
  T('brutal',      'Brutalist',      ['#ff3b00', '#000000', '#ffffff', '#efe9da', '#000000', '#d92f00', '#e4ddc8'],
    { radius: '0', step: '8', border_width: '3', shadow: 'hard', frame_opacity: '100', blur: '0', overlay: '0', font: 'mono', name_font: 'mono', font_size: '14', card_gap: '28' }),
  T('amber',       'Amber CRT',      ['#ffb000', '#4a3200', '#0a0600', '#000000', '#e6b84d', '#ffb000', '#030200'],
    { radius: '0', step: '4', border_width: '1', shadow: 'none', frame_opacity: '92', blur: '0', overlay: '85', font: 'mono', name_font: 'mono', font_size: '14', name_case: 'normal', card_gap: '14' }),
  T('vapor',       'Vaporwave',      ['#ff71ce', '#01cdfe', '#1a0b38', '#0f0524', '#f3e8ff', '#05ffa1', '#150530'],
    { radius: '14', step: '8', border_width: '2', shadow: 'hard', frame_opacity: '60', card_opacity: '88', blur: '8', overlay: '35', name_case: 'normal' }),

  // ---- Light / warm ----
  T('paper',       'Paper',          ['#b8432b', '#d8d2c4', '#ffffff', '#fbf8f1', '#1f1d1a', '#a33821', '#f1ece0'],
    { radius: '6', step: '8', border_width: '1', shadow: 'soft', frame_opacity: '92', blur: '0', overlay: '0', name_font: 'serif', name_case: 'normal', font_size: '16', card_gap: '30' }),
  T('moss',        'Moss',           ['#c9a227', '#4a5a3c', '#1f2a1c', '#141b12', '#e4e8d4', '#a8c97f', '#10160e'],
    { radius: '18', step: '10', border_width: '2', shadow: 'soft', frame_opacity: '80', blur: '4', overlay: '55', name_font: 'serif', name_case: 'normal', font_size: '16', card_gap: '26' }),
];
