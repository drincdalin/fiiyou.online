import { SELECTORS, PROPS, valid } from './customCss.js';
import { FONT_STACKS } from './theme.js';

/* ======================================================================
   customCssRender.js: draws the "Fine-tune" style rules (profile.custom_css) on a canvas.

   The rules are stored as [{ s: 'card', p: { 'border-radius': '12px', transform: 'rotate(-2deg)', ... } }].
   This file turns them into something the canvas renderers (desktopImage.js, promoImage.js) can use:

     createCss(rules)  -> .box(sel)    box props: bg, border colour / width / style, radius, padding,
                                       opacity, rotate, shadow, filter   (own values only, not inherited)
                          .text(sel)   text props with CSS inheritance down the page: colour, family,
                                       size, weight, letter-spacing, text-transform, text-align
                          .own(sel)    the raw valid values of one rule target
     createTextStyler(...)  font family / weight / text-transform / letter-spacing, applied to the canvas context
     createFx(...)     -> begin / end / group   draw something on its own layer, then put it back with
                                       opacity, tilt, filter and box-shadow (what CSS does to an element).

   Every value is re-checked with valid() from customCss.js, exactly like toCss() does for the live page.
   ====================================================================== */

const UI_STACK = '"Ubuntu Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const stackFor = (key) => ((FONT_STACKS[key] === 'var(--ui-font)' ? UI_STACK : FONT_STACKS[key]) || UI_STACK);

// Which rule targets a piece of text inherits from, outermost first. Same nesting as the page's DOM.
const SIDE = ['page', 'frame', 'side'];
const CARDS = ['page', 'frame', 'cards'];
const CHAIN = {
  page: ['page'],
  frame: ['page', 'frame'],
  side: SIDE,
  cards: CARDS,
  avatar: [...SIDE, 'avatar'],
  nameplate: [...SIDE, 'nameplate'],
  player: [...SIDE, 'player'],
  card: [...CARDS, 'card'],
  cardtitle: [...CARDS, 'card', 'cardtitle'],
  gallery: [...CARDS, 'card', 'gallery'],
  tags: [...CARDS, 'card', 'tags'],
  link: [...CARDS, 'card', 'link'],
};
const TEXT_KEYS = ['color', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'text-transform', 'text-align'];
const NONE = Object.freeze({});

/** '#rrggbb' or '#rrggbbaa' -> { hex: '#rrggbb', a: 0..1 } */
export const hexParts = (v) => ({ hex: v.slice(0, 7), a: v.length === 9 ? parseInt(v.slice(7, 9), 16) / 255 : 1 });

export const xform = (tt, s) => {
  s = String(s ?? '');
  if (tt === 'uppercase') return s.toUpperCase();
  if (tt === 'lowercase') return s.toLowerCase();
  if (tt === 'capitalize') return s.replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
  return s;
};

export function createCss(rules) {
  const own = {};
  if (Array.isArray(rules)) {
    for (const r of rules.slice(0, 40)) {
      if (!r || !SELECTORS[r.s] || !r.p || typeof r.p !== 'object') continue;
      for (const [k, v] of Object.entries(r.p).slice(0, 12)) if (valid(PROPS[k], v)) (own[r.s] ||= {})[k] = v;
    }
  }

  const box = (sel) => {
    const o = own[sel];
    if (!o) return NONE;
    const b = {};
    if (o['background-color']) b.bg = hexParts(o['background-color']);
    if (o['border-color']) b.borderColor = hexParts(o['border-color']).hex;
    if ('border-width' in o) b.borderWidth = parseInt(o['border-width'], 10);
    if ('border-style' in o) {
      if (o['border-style'] === 'none') b.borderWidth = 0; else b.borderStyle = o['border-style'];
    }
    if ('border-radius' in o) b.radius = parseInt(o['border-radius'], 10);
    if (o.padding) b.padding = parseInt(o.padding, 10);
    if (o.opacity) b.opacity = Number(o.opacity);
    if (o.transform) b.rotate = parseInt(o.transform.slice(7), 10) || 0;
    if (o['box-shadow']) b.shadow = o['box-shadow'];
    if (o.filter && o.filter !== 'none') b.filter = o.filter;
    return b;
  };

  const text = (sel) => {
    const o = {};
    for (const s of CHAIN[sel] || [sel]) {
      const r = own[s];
      if (r) for (const k of TEXT_KEYS) if (r[k] != null) o[k] = r[k];
    }
    return {
      color: o.color ? hexParts(o.color) : null,
      family: o['font-family'] ? stackFor(o['font-family']) : null,
      size: o['font-size'] ? parseInt(o['font-size'], 10) : null,
      weight: o['font-weight'] ? Number(o['font-weight']) : null,
      ls: o['letter-spacing'] ? parseInt(o['letter-spacing'], 10) : 0,
      tt: o['text-transform'] || 'none',
      ta: o['text-align'] || null,
    };
  };

  const ownColor = (sel) => (own[sel]?.color ? hexParts(own[sel].color) : null);
  const families = () => [...new Set(Object.values(own).map((r) => r['font-family']).filter(Boolean).map(stackFor))];

  return { has: Object.keys(own).length > 0, own: (sel) => own[sel] || NONE, box, text, ownColor, families };
}

/* ----------------------------------------------------------------- effects */

function rrp(g, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

const cssFilter = (kind, scale) => ({ grayscale: 'grayscale(1)', sepia: 'sepia(0.7)', blur: `blur(${(2 * scale).toFixed(2)}px)` }[kind] || 'none');

/** Same result as ctx.filter for browsers that do not have it (Safari): works on the layer's pixels. */
function filterPixels(layer, kind, scale) {
  const w = layer.width, h = layer.height;
  if (kind === 'blur') {
    const f = Math.max(2, Math.round(2 * scale * 1.5));
    const small = document.createElement('canvas'); small.width = Math.max(1, Math.round(w / f)); small.height = Math.max(1, Math.round(h / f));
    const sg = small.getContext('2d'); sg.imageSmoothingQuality = 'high'; sg.drawImage(layer, 0, 0, small.width, small.height);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const og = out.getContext('2d'); og.imageSmoothingQuality = 'high'; og.drawImage(small, 0, 0, w, h);
    return out;
  }
  try {
    const ctx = layer.getContext('2d'), img = ctx.getImageData(0, 0, w, h), d = img.data;
    const k = kind === 'sepia' ? 0.3 : 0; // sepia(.7): 30% of the original colour is kept
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (kind === 'sepia') {
        d[i] = Math.min(255, (0.393 + 0.607 * k) * r + (0.769 - 0.769 * k) * g + (0.189 - 0.189 * k) * b);
        d[i + 1] = Math.min(255, (0.349 - 0.349 * k) * r + (0.686 + 0.314 * k) * g + (0.168 - 0.168 * k) * b);
        d[i + 2] = Math.min(255, (0.272 - 0.272 * k) * r + (0.534 - 0.534 * k) * g + (0.131 + 0.869 * k) * b);
      } else {
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; d[i] = d[i + 1] = d[i + 2] = l;
      }
    }
    ctx.putImageData(img, 0, 0);
  } catch { /* tainted canvas: leave unfiltered */ }
  return layer;
}

/**
 * @param getG / setG  read and swap the renderer's current 2D context (the renderer keeps it in a `let g`)
 * @param mk           (w, h) => canvas
 * @param colors       { border, accent }  for the "hard" and "glow" shadows (var(--border), var(--accent) on the page)
 * @param unit         design-px -> canvas-px factor for shadow and blur sizes (1 for the desktop image, ~1.8 for the story cards)
 * @param full         layers are as big as the whole canvas (needed when the renderer resets the transform to draw full-canvas glass)
 */
export function createFx({ getG, setG, mk, colors, unit = 1, full = false }) {
  const SHADOWS = {
    soft: [0, 10, 30, 'rgba(0,0,0,0.45)'],
    hard: [6, 6, 0, colors.border],
    glow: [0, 0, 24, colors.accent],
  };

  /** Box shadow outside the box only, so the glass / fill inside stays clean. */
  function shadow(g, kind, { x, y, w, h, r }) {
    const spec = SHADOWS[kind]; if (!spec) return;
    const m = g.getTransform(), sc = Math.hypot(m.a, m.b) || 1, OFF = 4000;
    g.save();
    g.beginPath(); g.rect(-1e5, -1e5, 2e5, 2e5); rrp(g, x, y, w, h, r); g.clip('evenodd');
    g.beginPath(); rrp(g, x - OFF, y, w, h, r);
    g.shadowColor = spec[3]; g.shadowBlur = spec[2] * unit * sc; g.shadowOffsetX = (OFF + spec[0] * unit) * sc; g.shadowOffsetY = spec[1] * unit * sc;
    g.fillStyle = '#000'; g.fill();
    g.restore();
  }

  const layered = (b) => (b.opacity != null && b.opacity < 1) || !!b.rotate || !!b.filter;

  /** Starts a layer for `rect`. Everything drawn until end() goes to it. Returns null when nothing needs a layer (the shadow is then drawn directly). */
  function begin(rect, b, shadowKind = b.shadow) {
    const sh = shadowKind && shadowKind !== 'none' && SHADOWS[shadowKind] ? shadowKind : null;
    const g0 = getG();
    if (!layered(b)) { if (sh) shadow(g0, sh, rect); return null; }

    const m = g0.getTransform(), sc = Math.hypot(m.a, m.b) || 1, pad = (sh ? 90 * unit : 24) * sc;
    const p = m.transformPoint({ x: rect.x, y: rect.y });
    let x0 = Math.floor(p.x - pad), y0 = Math.floor(p.y - pad), x1 = Math.ceil(p.x + rect.w * sc + pad), y1 = Math.ceil(p.y + rect.h * sc + pad);
    const cw = g0.canvas.width, ch = g0.canvas.height;
    if (full) { x0 = 0; y0 = 0; x1 = cw; y1 = ch; } else { x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(cw, x1); y1 = Math.min(ch, y1); }
    if (x1 - x0 < 1 || y1 - y0 < 1) return null;

    const layer = mk(x1 - x0, y1 - y0), lg = layer.getContext('2d');
    lg.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0);
    lg.imageSmoothingEnabled = true; lg.imageSmoothingQuality = 'high';
    if ('letterSpacing' in g0) lg.letterSpacing = g0.letterSpacing;
    setG(lg);
    if (sh) shadow(lg, sh, rect);
    return { g0, layer, m, sc, x0, y0, rect, b };
  }

  /** Puts the layer back on the canvas it came from: tilted around the box centre, with opacity and filter. */
  function end(h) {
    if (!h) return;
    const { g0, layer, m, sc, x0, y0, rect, b } = h;
    setG(g0);
    g0.save();
    g0.setTransform(1, 0, 0, 1, 0, 0);
    if (b.rotate) {
      const c = m.transformPoint({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
      g0.translate(c.x, c.y); g0.rotate((b.rotate * Math.PI) / 180); g0.translate(-c.x, -c.y);
    }
    if (b.opacity != null) g0.globalAlpha *= b.opacity;
    let src = layer;
    if (b.filter) {
      if ('filter' in g0) g0.filter = cssFilter(b.filter, sc * unit);
      else src = filterPixels(layer, b.filter, sc * unit);
    }
    g0.drawImage(src, x0, y0);
    g0.restore();
  }

  function group(rect, b, draw, shadowKind = b.shadow) {
    const h = begin(rect, b, shadowKind);
    try { draw(); } finally { end(h); }
  }

  /** Applies a `filter` / `opacity` rule to everything already drawn on the whole canvas (used for the "Whole page" target). */
  function wholeCanvas(b) {
    if (!b.filter && !(b.opacity != null && b.opacity < 1)) return;
    const g0 = getG(), cw = g0.canvas.width, ch = g0.canvas.height;
    const copy = mk(cw, ch); copy.getContext('2d').drawImage(g0.canvas, 0, 0);
    const sc = Math.hypot(g0.getTransform().a, g0.getTransform().b) || 1;
    g0.save(); g0.setTransform(1, 0, 0, 1, 0, 0); g0.clearRect(0, 0, cw, ch);
    if (b.opacity != null) g0.globalAlpha = b.opacity;
    let src = copy;
    if (b.filter) { if ('filter' in g0) g0.filter = cssFilter(b.filter, sc * unit); else src = filterPixels(copy, b.filter, sc * unit); }
    g0.drawImage(src, 0, 0); g0.restore();
  }

  return { shadow: (kind, rect) => { const g = getG(); if (kind && kind !== 'none') shadow(g, kind, rect); }, begin, end, group, wholeCanvas };
}

/* ------------------------------------------------------------- text styling */

const FONT_RE = /^((?:italic|oblique)\s+)?(\d{3})\s+(\d+(?:\.\d+)?)px\s+(.+)$/;

const fontDescriptor = (ctx) => {
  for (let p = Object.getPrototypeOf(ctx); p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, 'font');
    if (d && d.get && d.set) return d;
  }
  return null;
};

/**
 * Text rules (font family, weight, text-transform, letter-spacing, size scale) for a canvas renderer that builds its font
 * strings itself. patch(ctx) wraps a 2D context so that, while a style is active, every `ctx.font = '700 30px <stack>'`
 * is restyled and measureText / fillText apply text-transform. Because measuring and drawing both go through the wrapped
 * context, line breaks and ellipsis match what is drawn.
 *
 *   const styler = createTextStyler({ bodyStack, nameStack });
 *   styler.patch(ctx);                                  // every context you draw or measure with (layers too)
 *   styler.set({ family, weight, scale, tt, ls });      // or styler.set(null) for "no custom text rules"
 *
 * family / weight only replace the body font (the page's name font has its own rule), and weight only replaces regular and
 * medium text (bold stays bold), like inherited `font-weight` does on the page. When the body and name font are the same
 * stack, the family cannot tell them apart and applies to both.
 */
export function createTextStyler({ bodyStack, nameStack }) {
  let st = null;
  const splitNames = nameStack !== bodyStack;

  function restyle(font) {
    if (!st) return { font, name: false };
    const m = FONT_RE.exec(font);
    if (!m) return { font, name: false };
    const body = m[4] === bodyStack;
    let weight = Number(m[2]), stack = m[4];
    if (body && st.family) stack = st.family;
    if (body && st.weight && weight <= 600) weight = st.weight;
    const px = Number(m[3]) * (st.scale || 1);
    return { font: `${m[1] || ''}${weight} ${Number(px.toFixed(2))}px ${stack}`, name: splitNames && m[4] === nameStack };
  }

  function patch(ctx) {
    if (!ctx || ctx.__styled) return ctx;
    let isName = false;
    const fd = fontDescriptor(ctx);
    if (fd) {
      Object.defineProperty(ctx, 'font', {
        configurable: true,
        enumerable: true,
        get() { return fd.get.call(this); },
        set(v) {
          const r = restyle(String(v));
          isName = r.name;
          fd.set.call(this, r.font);
          if ('letterSpacing' in this) this.letterSpacing = st && st.ls ? `${st.ls}px` : '0px';
        },
      });
    }
    const measure = ctx.measureText.bind(ctx), fill = ctx.fillText.bind(ctx);
    const tf = (s) => (st && st.tt && st.tt !== 'none' && !isName ? xform(st.tt, s) : String(s));
    ctx.measureText = (s, ...rest) => measure(tf(s), ...rest);
    ctx.fillText = (s, x, y, ...rest) => fill(tf(s), x, y, ...rest);
    ctx.__styled = true;
    return ctx;
  }

  return {
    patch,
    set: (style) => { st = style ? { family: null, weight: null, scale: 1, tt: 'none', ls: 0, ...style } : null; },
    /** Changes whenever the active style changes: use it in the key of any cache of font measurements. */
    key: () => (st ? `${st.family}|${st.weight}|${st.scale}|${st.tt}|${st.ls}` : ''),
  };
}
