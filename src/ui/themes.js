import { THEME_DEFAULTS } from './theme.js';
// Ready-made themes. Every value is valid for the database check (see is_valid_theme); users can tweak anything afterwards.
const shape = { radius: '24', step: '8', border_width: '1', border_style: 'solid', shadow: 'none', frame_opacity: '70', card_opacity: '100', blur: '4', overlay: '60',
  font: 'ubuntu', name_font: 'ubuntu', font_size: '15', name_case: 'upper', layout: 'side-left', sidebar: '190', card_gap: '24', bg_repeat: 'cover', bg_fixed: 'fixed', cursor: 'default' };
const T = (id, name, c, extra = {}) => ({ id, name, theme: { ...THEME_DEFAULTS, ...shape, accent_color: c[0], border_color: c[1], card_color: c[2], frame_color: c[3], text_color: c[4], link_color: c[5], bg_color: c[6], ...extra } });
//                                  accent     border     card       frame      text       link       page bg
export const PRESETS = [
  T('classic',   'Classic Red',  ['#b3121b', '#6e1015', '#141414', '#000000', '#f2f2f2', '#ff5a62', '#0b0b0b']),
  T('midnight',  'Midnight',     ['#4f8cff', '#1f3a6b', '#0f1626', '#05080f', '#e8eefc', '#7fb0ff', '#070b14'], { radius: '16', shadow: 'soft', blur: '8', name_case: 'normal' }),
  T('forest',    'Forest',       ['#3fbf7f', '#1d5238', '#0e1a14', '#060d0a', '#e6f3ec', '#6fe0a2', '#08110d'], { radius: '16', name_case: 'normal' }),
  T('sunset',    'Sunset',       ['#ff7a3d', '#7a3a1d', '#1c1210', '#0d0807', '#fff1e8', '#ffa36b', '#120b08'], { shadow: 'soft' }),
  T('bubblegum', 'Bubblegum',    ['#ff5fa2', '#7a2a55', '#1a0f17', '#0c060a', '#ffe9f3', '#ff8fc0', '#12080e'], { radius: '32', border_width: '2', shadow: 'hard', name_case: 'normal' }),
  T('lavender',  'Lavender',     ['#a78bfa', '#4c3a8a', '#14111f', '#0a0813', '#efeaff', '#c4b5fd', '#0b0914'], { shadow: 'soft', blur: '8', name_case: 'normal' }),
  T('terminal',  'Terminal',     ['#39ff88', '#145a32', '#050805', '#000000', '#b7ffd0', '#39ff88', '#000000'], { radius: '0', step: '4', font: 'mono', name_font: 'mono', font_size: '14', blur: '0', frame_opacity: '85' }),
  T('paper',     'Paper (light)', ['#c4452d', '#d8d2c4', '#ffffff', '#fffdf8', '#1b1b1b', '#b03a24', '#f3efe6'], { radius: '16', shadow: 'soft', blur: '0', overlay: '0', frame_opacity: '85', name_font: 'serif', name_case: 'normal' }),
  T('mono',      'Mono',         ['#f4f4f4', '#3a3a3a', '#141414', '#000000', '#f4f4f4', '#ffffff', '#080808'], { radius: '16' }),
];
