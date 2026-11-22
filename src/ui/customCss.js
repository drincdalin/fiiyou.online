import { FONT_STACKS } from './theme.js';
// Mirrors is_valid_custom_css() in 0012. The database is the real gatekeeper; this re-checks at render time anyway.
export const SELECTORS = { page: ['Whole page', '.page'], frame: ['Main frame', '.page .frame'], side: ['Sidebar', '.page .side'], avatar: ['Avatar', '.page .avatar'],
  nameplate: ['Name plate', '.page .nameplate'], player: ['Music player', '.page .player'], cards: ['Card column', '.page .cards'], card: ['Cards', '.page .card'],
  cardtitle: ['Card titles', '.page .card h2'], gallery: ['Gallery', '.page .gal'], tags: ['Tags', '.page .tags span'], link: ['Links', '.page .card a'] };
const px = (min, max, def) => ({ type: 'px', min, max, def: `${def}px` });
export const PROPS = {
  color: { label: 'Text color', type: 'color', def: '#ffffff' }, 'background-color': { label: 'Background', type: 'color', def: '#141414' }, 'border-color': { label: 'Border color', type: 'color', def: '#6e1015' },
  'border-width': px(0, 8, 1), 'border-style': { type: 'enum', opts: ['none', 'solid', 'dashed', 'dotted', 'double'], def: 'solid' }, 'border-radius': px(0, 48, 16), padding: px(0, 48, 16),
  'font-size': px(10, 32, 16), 'font-weight': { type: 'enum', opts: ['400', '500', '600', '700', '800'], def: '600' }, 'letter-spacing': px(-1, 6, 1),
  'text-transform': { type: 'enum', opts: ['none', 'uppercase', 'lowercase', 'capitalize'], def: 'uppercase' }, 'text-align': { type: 'enum', opts: ['left', 'center', 'right'], def: 'center' },
  opacity: { type: 'opacity', def: '0.9' }, transform: { type: 'rotate', def: 'rotate(-2deg)' }, 'box-shadow': { type: 'enum', opts: ['none', 'soft', 'hard', 'glow'], def: 'soft' },
  filter: { type: 'enum', opts: ['none', 'grayscale', 'sepia', 'blur'], def: 'grayscale' }, 'font-family': { type: 'enum', opts: ['sans', 'serif', 'mono', 'pixel', 'verdana', 'comic', 'ubuntu'], def: 'serif' },
};
PROPS.opacity.label = 'Opacity'; PROPS.transform.label = 'Tilt'; PROPS['box-shadow'].label = 'Shadow'; PROPS.filter.label = 'Filter'; PROPS['font-family'].label = 'Font';
for (const [k, s] of Object.entries(PROPS)) s.label ||= k.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
const num = (v, re) => { const m = re.exec(v); return m ? Number(m[1]) : NaN; };
export function valid(spec, v) {
  if (typeof v !== 'string' || !spec) return false;
  switch (spec.type) {
    case 'color': return /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v);
    case 'px': { const n = num(v, /^(-?\d{1,2})px$/); return Number.isInteger(n) && n >= spec.min && n <= spec.max; }
    case 'enum': return spec.opts.includes(v);
    case 'opacity': return /^(0\.[1-9]|1)$/.test(v);
    case 'rotate': { const n = num(v, /^rotate\((-?\d{1,2})deg\)$/); return Number.isInteger(n) && n >= -20 && n <= 20; }
    default: return false;
  }
}
const OUT = { 'box-shadow': { none: 'none', soft: '0 10px 30px rgba(0,0,0,.45)', hard: '6px 6px 0 var(--border)', glow: '0 0 24px var(--accent)' },
  filter: { none: 'none', grayscale: 'grayscale(1)', sepia: 'sepia(.7)', blur: 'blur(2px)' } };
/** Rules -> stylesheet text. Only fixed selectors and re-validated values can appear in the output. */
export function toCss(rules) {
  if (!Array.isArray(rules)) return '';
  return rules.slice(0, 40).map((r) => {
    const sel = SELECTORS[r?.s]?.[1]; if (!sel || !r.p || typeof r.p !== 'object') return '';
    const d = Object.entries(r.p).slice(0, 12).filter(([k, v]) => valid(PROPS[k], v)).map(([k, v]) => `${k}:${k === 'font-family' ? FONT_STACKS[v] : OUT[k]?.[v] ?? v}`);
    return d.length ? `${sel}{${d.join(';')}}` : '';
  }).filter(Boolean).join('\n');
}
