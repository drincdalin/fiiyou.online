import { FONT_STACKS, THEME_DEFAULTS } from './theme.js';
import { onColor, VERIFIED_BLUE } from './appTheme.js';
import { profileUrl } from './storyImage.js';
import { createCss, createFx, createTextStyler } from './customCssRender.js';

/* ======================================================================
   desktopImage.js: the "Full profile" share image.

   Draws the profile the way the web page draws it on a computer: the same
   frame, the same sidebar | divider | cards grid (side-left, side-right or
   single, whatever the theme says), the same spacing, the same card types
   and the same stickers pinned to the same avatar / cards. All sizes are the
   page's own CSS pixels; the canvas is just rendered at 2x so text is crisp.

   The image is as tall as the profile is (nothing is cut or shrunk to fit).

   The "Fine-tune" rules (profile.custom_css, passed in as `customCss`) are
   drawn too: colours, borders, radius, padding, opacity, tilt, shadow,
   filter, font, size, weight, case and letter-spacing, for every target
   (page, frame, sidebar, avatar, name plate, player, card column, cards,
   card titles, gallery, tags, links). See customCssRender.js.

   Left out on purpose: the owner-only buttons (Customize / Share) and
   delete buttons.
   ====================================================================== */

const FRAME_W = 1210;          // max-width of .frame on the page
const MARGIN = 64;             // page background shown around the frame
const MAX_PIXELS = 12e6;       // keep the canvas below what phones can handle

const UI_STACK = '"Ubuntu Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const stackOf = (key, family) => (key === 'custom'
  ? (family ? `"${family}", ${UI_STACK}` : UI_STACK)
  : (FONT_STACKS[key] === 'var(--ui-font)' ? UI_STACK : FONT_STACKS[key]) || UI_STACK);

/* ------------------------------------------------------------- helpers */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const loadImg = (src) => new Promise((res) => {
  if (!src) return res(null);
  const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
});
const rgbOf = (hex) => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim()); if (!m) return [0, 0, 0];
  let s = m[1]; if (s.length === 3) s = [...s].map((c) => c + c).join('');
  const n = parseInt(s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex, a) => { const [r, g, b] = rgbOf(hex); return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`; };
const lumOf = ([r, g, b]) => { const f = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrastOf = (a, b) => { const [hi, lo] = [lumOf(a), lumOf(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const mixHex = (a, b, t) => { const x = rgbOf(a), y = rgbOf(b); return `rgb(${x.map((c, i) => Math.round(c + (y[i] - c) * t)).join(',')})`; };

function rrp(g, x, y, w, h, r) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  g.moveTo(x + k, y); g.arcTo(x + w, y, x + w, y + h, k); g.arcTo(x + w, y + h, x, y + h, k); g.arcTo(x, y + h, x, y, k); g.arcTo(x, y, x + w, y, k); g.closePath();
}
const rr = (g, x, y, w, h, r) => { g.beginPath(); rrp(g, x, y, w, h, r); };

function drawCover(g, im, x, y, w, h) {
  const s = Math.max(w / im.width, h / im.height), sw = w / s, sh = h / s;
  g.save(); if (s > 1.01 && Math.max(im.width, im.height) <= 160) g.imageSmoothingEnabled = false;   // keep tiny pixel-art avatars crisp
  g.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, w, h); g.restore();
}
function drawContain(g, im, x, y, w, h) {
  const s = Math.min(w / im.width, h / im.height), dw = im.width * s, dh = im.height * s;
  g.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function ellipsize(g, text, maxW) {
  let s = String(text || ''); if (g.measureText(s).width <= maxW) return s;
  while (s && g.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** Wrap plain text (pre-wrap: keeps line breaks). Long words are broken. */
function wrapPlain(g, text, maxW) {
  const lines = [];
  for (const para of String(text || '').replace(/\r/g, '').split('\n')) {
    let cur = '';
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (g.measureText(word).width > maxW && word.length > 1) {
        let i = word.length; while (i > 1 && g.measureText(word.slice(0, i)).width > maxW) i--;
        if (cur) { lines.push(cur); cur = ''; } lines.push(word.slice(0, i)); word = word.slice(i);
      }
      const cand = cur ? `${cur} ${word}` : word;
      if (g.measureText(cand).width <= maxW) cur = cand; else { if (cur) lines.push(cur); cur = word; }
    }
    lines.push(cur);
  }
  return lines;
}

const compact = (v) => { const n = Number(v); if (!Number.isFinite(n)) return ''; if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`; if (n >= 1e4) return `${Math.round(n / 1e3)}k`; if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`; return String(n); };
const plural = (n, w) => `${compact(n)} ${w}${Number(n) === 1 ? '' : 's'}`;

/* ---------------------------------------------------------------- main */

export async function renderDesktop(opts) {
  const { profile, theme, avatarSrc, bgSrc, music = null, interests = [], cards = [], photos = [], topFriends = [], guestbook = [],
    stickers = [], slug = opts.profile?.username, fontFamily = null, actions = 'visitor', customCss = [] } = opts;
  if (!profile) throw new Error('renderDesktop requires a profile object');

  const t = { ...THEME_DEFAULTS, ...(theme || {}) };
  const css = createCss(customCss);
  const bodyStack = stackOf(t.font, fontFamily), nameStack = stackOf(t.name_font, fontFamily);
  try {
    const loads = [400, 500, 600, 700, 800].map((w) => document.fonts.load(`${w} 16px ${bodyStack}`)).concat(document.fonts.load(`800 24px ${nameStack}`));
    for (const st of css.families()) for (const w of [400, 500, 600, 700, 800]) loads.push(document.fonts.load(`${w} 16px ${st}`));   // fonts picked in Fine-tune
    await document.fonts.ready; await Promise.all(loads);
  } catch { /* best effort */ }

  const hasMusic = !!(music && (music.title || music.artist));
  const shownPhotos = photos.slice(0, 30), shownFriends = topFriends.slice(0, 8), shownGb = guestbook.slice(0, 10);
  const [avatar, bg, cover, photoImgs, friendImgs, gbImgs, stickerImgs] = await Promise.all([
    loadImg(avatarSrc), loadImg(bgSrc), hasMusic ? loadImg(music.coverSrc) : null,
    Promise.all(shownPhotos.map((p) => loadImg(p.src))), Promise.all(shownFriends.map((f) => loadImg(f.src))),
    Promise.all(shownGb.map((r) => loadImg(r.src))), Promise.all(stickers.map((s) => loadImg(s.src))),
  ]);

  /* ---- the page's own metrics (CSS px) ---- */
  const baseFs = clamp(num(t.font_size, 15), 12, 20), step = num(t.step, 8), bw = clamp(num(t.border_width, 1), 0, 6);
  const tr1 = num(t.radius, 24), tr2 = Math.max(0, tr1 - step), r3 = Math.max(0, tr1 - step * 2);
  const gapCol = Math.max(num(t.card_gap, 24), 20), gapCards = Math.max(num(t.card_gap, 24), 16), gapSide = Math.max(step, 14);
  const baseP = Math.max(step * 3, 20), baseCardPad = Math.max(step * 2, 18), sidebar = num(t.sidebar, 190);
  const layout = ['side-left', 'side-right', 'single'].includes(t.layout) ? t.layout : 'side-left';
  const cardAlpha = clamp(num(t.card_opacity, 100) / 100, 0, 1), frameAlpha = clamp(num(t.frame_opacity, 100) / 100, 0, 1);
  const blurPx = num(t.blur, 0), overlay = clamp(num(t.overlay, 0) / 100, 0, 1);
  // The text style in force: Fine-tune can change it per region (see use() below), so these are `let`.
  let fs = baseFs, LH = fs * 1.5, ink = t.text_color, linkCol = t.link_color, curTS = null;
  const onAccent = onColor(rgbOf(t.accent_color));
  const mutedC = rgba(t.text_color, 0.62), dimC = rgba(t.text_color, 0.45);
  const cardOver = (a) => rgba(t.card_color, a);
  const caseOf = (s) => (t.name_case === 'upper' ? s.toUpperCase() : s);
  const dispName = caseOf(profile.display_name || profile.username || 'user');
  const initial = (s) => String(s || '?').trim().charAt(0).toUpperCase() || '?';

  /* ---- Fine-tune: what each rule target ends up with (its own value, or the page's default) ---- */
  const edge = (sel, d) => {
    const b = css.box(sel), width = b.borderWidth ?? (b.borderStyle && !d.bw ? 3 : d.bw);
    return { b, bw: clamp(width, 0, 12), style: b.borderStyle || t.border_style || 'solid', color: b.borderColor || d.color,
      r: b.radius ?? d.r, pad: b.padding ?? d.pad, bg: b.bg ? [b.bg.hex, b.bg.a] : d.bg };
  };
  const bare = { bw: 0, color: t.border_color, r: 0, pad: 0, bg: null };      // containers that have no box of their own by default
  const FR = edge('frame', { bw, color: t.border_color, r: tr1, pad: baseP, bg: [t.frame_color, frameAlpha] });
  const SD = edge('side', bare), CS = edge('cards', bare), GL = edge('gallery', bare), CT = edge('cardtitle', bare);
  const CR = edge('card', { bw, color: t.border_color, r: tr2, pad: baseCardPad, bg: [t.card_color, cardAlpha] });
  const AV = edge('avatar', { bw, color: t.accent_color, r: tr2, pad: 0, bg: [t.card_color, 1] });
  const NP = edge('nameplate', { bw, color: t.border_color, r: tr2, pad: null, bg: [t.card_color, cardAlpha] });
  const PL = edge('player', { bw, color: t.border_color, r: tr2, pad: Math.max(step, 12), bg: [t.card_color, cardAlpha] });
  const TG = edge('tags', { bw, color: t.border_color, r: r3, pad: null, bg: null });
  const r1 = FR.r, P = FR.pad, fbw = FR.bw, cardPad = CR.pad;

  /** Text rules for one target, with CSS inheritance (page > frame > side/cards > card > ...). */
  const textStyle = (sel) => {
    const x = css.text(sel), size = clamp(x.size ?? baseFs, 8, 40), c = x.color;
    return { fs: size, LH: size * 1.5, ta: x.ta, custom: !!c, hex: c ? c.hex : t.text_color, a: c ? c.a : 1,
      ink: c ? rgba(c.hex, c.a) : t.text_color, link: css.ownColor('link') ? rgba(css.ownColor('link').hex, css.ownColor('link').a) : t.link_color,
      ctx: css.has ? { family: x.family, weight: x.weight, tt: x.tt, ls: x.ls } : null };
  };
  const styler = createTextStyler({ bodyStack, nameStack });
  const use = (ts) => { curTS = ts; fs = ts.fs; LH = ts.LH; ink = ts.ink; linkCol = ts.link; styler.set(ts.ctx); };
  const dimOf = () => (curTS.custom ? rgba(curTS.hex, curTS.a * 0.6) : dimC);       // muted text follows a custom colour
  const pageTS = textStyle('page'); use(pageTS);

  /* a scratch context only used to measure text */
  const meas = styler.patch(mk(8, 8).getContext('2d'));
  const F = (w, size, stack = bodyStack) => `${w} ${size}px ${stack}`;
  const setF = (font) => { meas.font = font; return meas; };
  const wOf = (font, s) => setF(font).measureText(s).width;

  /* ---- measure everything first (layout is computed before any drawing) ---- */
  const CW = FRAME_W - 2 * fbw - 2 * P;                                 // width of the grid inside the frame
  const colsW = layout === 'single' ? CW : CW - sidebar - 1 - 2 * gapCol;
  const cardsW = colsW;
  const sidePB = SD.bw + (SD.pad || 0), cardsPB = CS.bw + (CS.pad || 0);   // border + padding of the sidebar / card column
  const sideInner = (layout === 'single' ? CW : sidebar) - 2 * sidePB, cardsInner = cardsW - 2 * cardsPB;

  /* -- tiny rich text: **bold** and *italic* -- */
  function richLines(text, width, size) {
    const toks = [];
    for (const [pi, para] of String(text || '').replace(/\r/g, '').split('\n').entries()) {
      if (pi) toks.push({ br: true });
      const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*)/g; let last = 0, m;
      const push = (s, bold, ital) => s.split(/(\s+)/).filter((x) => x !== '').forEach((w) => toks.push({ w, bold, ital }));
      while ((m = re.exec(para))) { push(para.slice(last, m.index), false, false); const s = m[0]; s.startsWith('**') ? push(s.slice(2, -2), true, false) : push(s.slice(1, -1), false, true); last = m.index + s.length; }
      push(para.slice(last), false, false);
    }
    const font = (k) => `${k.ital ? 'italic ' : ''}${k.bold ? 700 : 400} ${size}px ${bodyStack}`;
    const lines = [[]]; let x = 0;
    for (const k of toks) {
      if (k.br) { lines.push([]); x = 0; continue; }
      const w = wOf(font(k), k.w); const space = /^\s+$/.test(k.w);
      if (space) { if (x > 0) { lines[lines.length - 1].push({ ...k, width: w }); x += w; } continue; }
      if (x + w > width && x > 0) { const ln = lines[lines.length - 1]; while (ln.length && /^\s+$/.test(ln[ln.length - 1].w)) ln.pop(); lines.push([]); x = 0; }
      lines[lines.length - 1].push({ ...k, width: w }); x += w;
    }
    return { lines, font };
  }

  /* -- cards -- */
  const cardInnerW = (w) => w - 2 * CR.bw - 2 * cardPad;

  const bodies = {
    about: (iw, c) => {
      const { lines, font } = richLines(c.content?.body || '', iw, fs), al = curTS.ta;
      return { h: Math.max(1, lines.length) * LH, draw: (x, y) => lines.forEach((ln, i) => {
        const used = [...ln]; while (used.length && /^\s+$/.test(used[used.length - 1].w)) used.pop();
        const lw = used.reduce((a, k) => a + k.width, 0); let cx = al === 'center' ? x + (iw - lw) / 2 : al === 'right' ? x + iw - lw : x;
        ln.forEach((k) => { if (!/^\s+$/.test(k.w)) put(k.w, cx, y + i * LH, font(k), ink, LH); cx += k.width; });
      }) };
    },
    links: (iw, c) => {
      const items = (c.content?.links || []).filter((l) => l?.url).slice(0, 20), lts = textStyle('link'), L = lts.LH;
      return { h: items.length * L, draw: (x, y) => { const keep = curTS; use(lts); items.forEach((l, i) => {
        const ly = y + i * L; g.fillStyle = keep.ink; g.beginPath(); g.arc(x + 29, ly + L / 2, 2.6, 0, 7); g.fill();
        const label = l.label || l.url, font = F(400, lts.fs);
        g.font = font; const s = ellipsize(g, label, iw - 40); put(s, x + 40, ly, font, lts.link, L);
        g.fillStyle = lts.link; g.fillRect(x + 40, ly + L / 2 + lts.fs * 0.42, g.measureText(s).width, Math.max(1, lts.fs / 15));
      }); use(keep); } };
    },
    interests: (iw, c) => {
      const list = (c.content?.interests?.length ? c.content.interests : interests).slice(0, 30), tts = textStyle('tags');
      const ph = TG.pad ?? 1.6, pw = TG.pad ?? 11.2, th = tts.LH + ph * 2 + TG.bw * 2, font = F(400, tts.fs), keep = curTS;
      use(tts);
      const pos = []; let x = 0, y = 0;
      list.forEach((s) => { const w = Math.min(wOf(font, s) + pw * 2 + TG.bw * 2, iw); if (x > 0 && x + w > iw) { x = 0; y += th + 6; } pos.push({ s, x, y, w }); x += w + 6; });
      use(keep);
      return { h: list.length ? y + th : 0, draw: (ox, oy) => { const was = curTS; use(tts); pos.forEach(({ s, x: px, y: py, w }) => {
        wrap(TG, { x: ox + px, y: oy + py, w, h: th }, () => { g.font = font; put(ellipsize(g, s, w - pw * 2 - TG.bw * 2), ox + px + TG.bw + pw, oy + py + TG.bw + ph, font, ink, tts.LH); });
      }); use(was); } };
    },
    gallery: (iw) => {
      if (!shownPhotos.length) { const f = F(400, fs * 0.88); return { h: fs * 0.88 * 1.5, draw: (x, y) => put('No photos yet.', x, y, f, mutedC, fs * 0.88 * 1.5) }; }
      const gp = GL.bw + (GL.pad || 0), ow = iw; iw -= 2 * gp;
      const n = Math.max(1, Math.floor((iw + step) / (170 + step))), tw = (iw - step * (n - 1)) / n, th = (tw - 2 * bw) * 0.75 + 2 * bw, rows = Math.ceil(shownPhotos.length / n);
      const gh = rows * th + (rows - 1) * step + 2 * gp;
      return { h: gh, draw: (x0, y0) => wrap(GL, { x: x0, y: y0, w: ow, h: gh }, () => shownPhotos.forEach((_, i) => {
        const tx = x0 + gp + (i % n) * (tw + step), ty = y0 + gp + Math.floor(i / n) * (th + step);
        g.save(); rr(g, tx, ty, tw, th, r3); g.clip(); g.fillStyle = mixHex(t.card_color, '#000000', 0.4); g.fillRect(tx, ty, tw, th);
        if (photoImgs[i]) drawContain(g, photoImgs[i], tx + bw, ty + bw, tw - 2 * bw, th - 2 * bw); g.restore(); outline(tx, ty, tw, th, r3, t.border_color, bw);
      })) };
    },
    top_friends: (iw) => {
      if (!shownFriends.length) { const f = F(400, fs * 0.88); return { h: fs * 0.88 * 1.5, draw: (x, y) => put('No top friends yet.', x, y, f, mutedC, fs * 0.88 * 1.5) }; }
      const n = Math.max(1, Math.floor((iw + 10) / (78 + 10))), tw = (iw - 10 * (n - 1)) / n, lab = fs * 0.78, th = bw * 2 + 8 + 52 + 5 + lab * 1.5 + 6, rows = Math.ceil(shownFriends.length / n);
      return { h: rows * th + (rows - 1) * 12, draw: (x, y) => shownFriends.forEach((f, i) => {
        const tx = x + (i % n) * (tw + 10), ty = y + Math.floor(i / n) * (th + 12);
        panel(tx, ty, tw, th, r3, t.card_color, 0.7); outline(tx, ty, tw, th, r3, t.border_color, bw);
        const ax = tx + tw / 2 - 26, ay = ty + bw + 8; pic(friendImgs[i], ax, ay, 52, 52, 26, initial(f.name || f.username), null);
        const font = F(400, lab); g.font = font; put(ellipsize(g, f.name || f.username || '', tw - 8 - 2 * bw), tx + tw / 2, ay + 52 + 5, font, ink, lab * 1.5, 'center');
      }) };
    },
    guestbook: (iw) => {
      const inH = 42, formH = inH + 9.6;
      const rows = shownGb.map((r, i) => {
        const tx = 38 + 10, room = iw - tx, nf = F(700, fs), uf = F(400, fs * 0.88);
        const nameW = wOf(nf, r.name || ''); void nameW;
        const lines = wrapPlain(setF(F(400, fs)), r.body || '', room).slice(0, 12);
        const h = Math.max(38, LH + 2.4 + lines.length * LH) + 9.6 * 2 + 1;
        return { r, i, lines, h, nf, uf, room };
      });
      return { h: formH + rows.reduce((a, r) => a + r.h, 0), draw: (x, y) => {
        const bwid = 74; rr(g, x, y, iw - bwid - 8, inH, r3); g.fillStyle = mixHex(t.card_color, '#000000', 0.2); g.fill(); outline(x, y, iw - bwid - 8, inH, r3, t.border_color, Math.max(1, bw));
        put('Write something…', x + 14, y, F(400, fs), dimC, inH);
        rr(g, x + iw - bwid, y, bwid, inH, r3); g.fillStyle = rgba(t.text_color, 0.1); g.fill(); put('Send', x + iw - bwid / 2, y, F(800, fs), rgba(t.text_color, 0.45), inH, 'center');
        let yy = y + formH;
        rows.forEach(({ r, i, lines, h, nf, uf, room }) => {
          g.fillStyle = t.border_color; g.fillRect(x, yy, iw, 1);
          pic(gbImgs[i], x, yy + 9.6 + 1, 38, 38, 19, initial(r.name || r.username), null);
          const tx = x + 48; g.font = nf; const nm = ellipsize(g, r.name || r.username || '', room * 0.7); put(nm, tx, yy + 1 + 9.6, nf, ink, LH);
          if (r.username) put(`@${r.username}`, tx + g.measureText(nm).width + 6, yy + 1 + 9.6, uf, mutedC, LH);
          lines.forEach((ln, k) => put(ln, tx, yy + 1 + 9.6 + LH + 2.4 + k * LH, F(400, fs), ink, LH));
          yy += h;
        });
      } };
    },
  };
  bodies.text = bodies.about;

  const flow = cards.filter((c) => c && c.type !== 'music' && c.type !== 'sticker' && bodies[c.type]);
  const cardTS = textStyle('card'), titleTS = textStyle('cardtitle');
  // the title (h2) keeps its own font-weight rule; everything else it inherits from the card
  if (titleTS.ctx) titleTS.ctx = { ...titleTS.ctx, weight: Number(css.own('cardtitle')['font-weight']) || null };
  const ctp = CT.bw + (CT.pad || 0);
  const cardBlocks = flow.map((c) => {
    use(cardTS);
    const iw = cardInnerW(cardsInner), body = bodies[c.type](iw, c);
    const tBox = titleTS.LH + 2 * ctp, titleH = tBox + 12, h = 2 * CR.bw + 2 * cardPad + titleH + body.h;      // h2 box + margin-bottom
    return { id: c.id, h, draw(x, y, w) {
      wrap(CR, { x, y, w, h }, () => {
        const ix = x + CR.bw + cardPad, iy = y + CR.bw + cardPad;
        use(titleTS);
        wrap(CT, { x: ix, y: iy, w: iw, h: tBox }, () => {
          const f = F(600, fs), al = titleTS.ta; g.font = f; const s = ellipsize(g, c.title || '', iw - 2 * ctp);
          put(s, al === 'center' ? ix + iw / 2 : al === 'right' ? ix + iw - ctp : ix + ctp, iy + ctp, f, ink, LH, al || 'left');
        });
        use(cardTS); body.draw(ix, iy + titleH, iw);
      }, true);
    } };
  });
  const cardsH = cardBlocks.reduce((a, b) => a + b.h, 0) + Math.max(0, cardBlocks.length - 1) * gapCards;

  /* -- sidebar -- */
  const avatarBlock = (w) => {
    const h = w * 1.2, ats = textStyle('avatar');
    return { kind: 'avatar', h, w, draw(x, y) {
      use(ats); spots.set('avatar', { x, y, w, h });
      fx.group({ x, y, w, h, r: AV.r }, AV.b, () => {
        const inset = AV.pad ? AV.bw + AV.pad : 0, ix = x + inset, iy = y + inset, iw = w - 2 * inset, ih = h - 2 * inset;
        g.save(); rr(g, x, y, w, h, AV.r); g.clip(); g.fillStyle = rgba(AV.bg[0], AV.bg[1]); g.fillRect(x, y, w, h);
        if (avatar) drawCover(g, avatar, ix, iy, iw, ih); else { g.fillStyle = rgba(t.accent_color, 0.22); g.fillRect(ix, iy, iw, ih); }
        g.restore();
        if (!avatar) put(initial(dispName), x + w / 2, y, F(800, w * 0.4, nameStack), ink, h, 'center');
        outline(x, y, w, h, AV.r, AV.color, AV.bw, AV.style);
      });
    } };
  };
  const nameplateBlock = (w) => {
    const nts = textStyle('nameplate'); use(nts);
    const vp = NP.pad ?? 16, hp = NP.pad ?? 12;                                // .nameplate { padding: 16px 12px }
    const iw = w - 2 * NP.bw - 2 * hp, h1f = F(800, fs * 1.5, nameStack), sf = F(500, fs * 0.88), badge = !!profile.verified, bd = fs * 1.5 * 0.8;
    const nameLines = wrapPlain(setF(h1f), dispName, iw - (badge ? bd + 4 : 0)), h1LH = fs * 1.5 * 1.1, sLH = fs * 0.88 * 1.5;
    const handle = `@${profile.username}${profile.locality ? ` · ${profile.locality}` : ''}`, hl = wrapPlain(setF(sf), handle, iw);
    const fr = profile.friends ?? profile.friends_count, vw = profile.views;
    const stats = [fr != null ? plural(fr, 'friend') : '', vw != null ? plural(vw, 'view') : ''].filter(Boolean).join(' · ');
    const h = 2 * NP.bw + 2 * vp + nameLines.length * h1LH + 4 + hl.length * sLH + (stats ? 4 + 2 + sLH : 0);
    return { kind: 'nameplate', h, w, draw(x, y) {
      use(nts);
      wrap(NP, { x, y, w, h }, () => {
        let yy = y + NP.bw + vp; const mid = x + w / 2, al = nts.ta, ax = al === 'left' ? x + NP.bw + hp : al === 'right' ? x + w - NP.bw - hp : mid, an = al || 'center', dim = dimOf();
        nameLines.forEach((ln, i) => {
          const tw = wOf(h1f, ln), extra = badge && i === nameLines.length - 1 ? bd * 0.8 + 3 : 0, left = mid - (tw + extra) / 2;
          put(ln, left, yy + i * h1LH, h1f, ink, h1LH); if (extra) badgeAt(left + tw + 3 + bd * 0.4, yy + i * h1LH + h1LH / 2, bd * 0.4);
        });
        yy += nameLines.length * h1LH + 4; hl.forEach((ln, i) => put(ln, ax, yy + i * sLH, sf, dim, sLH, an)); yy += hl.length * sLH;
        if (stats) put(stats, ax, yy + 6, sf, dim, sLH, an);
      }, true);
    } };
  };
  const headlineBlock = (w) => {
    if (!profile.headline) return null; const hts = textStyle('side'); use(hts);
    const f = F(400, fs * 0.9), lh = fs * 0.9 * 1.45, lines = wrapPlain(setF(f), profile.headline, w - 12);
    return { kind: 'headline', h: lines.length * lh, w, draw(x, y) {
      use(hts); const al = hts.ta || 'center', ax = al === 'left' ? x + 6 : al === 'right' ? x + w - 6 : x + w / 2, col = hts.custom ? rgba(hts.hex, hts.a * 0.75) : rgba(t.text_color, 0.75);
      lines.forEach((ln, i) => put(ln, ax, y + i * lh, f, col, lh, al));
    } };
  };
  const playerBlock = (w) => {
    if (!hasMusic) return null;
    const pts = textStyle('player'); use(pts);
    const pad = PL.pad, iw = w - 2 * PL.bw - 2 * pad, tf = F(700, 19.2), af = F(400, 19.2 * 0.85), gap = 10;
    const cov = cover ? iw : 0, tl = wrapPlain(setF(tf), music.title || 'Untitled', iw).slice(0, 2), al = music.artist ? wrapPlain(setF(af), music.artist, iw).slice(0, 2) : [];
    const tLH = 19.2 * 1.5, aLH = 19.2 * 0.85 * 1.5, rows = [cov, tl.length * tLH + al.length * aLH, 16, 10.5 * 1.5 - 6, 40, 1 + 8 + 28];
    const h = 2 * PL.bw + 2 * pad + rows.filter((r) => r > 0).reduce((a, r) => a + r, 0) + (rows.filter((r) => r > 0).length - 1) * gap;
    return { kind: 'player', h, w, draw(x, y) {
      use(pts);
      wrap(PL, { x, y, w, h }, () => {
      let yy = y + PL.bw + pad; const ix = x + PL.bw + pad, mid = x + w / 2, soft = pts.custom ? rgba(pts.hex, pts.a * 0.6) : rgba(t.text_color, 0.6);
      if (cover) { pic(cover, ix, yy, iw, iw, r3, '♪', null); yy += iw + gap; }
      tl.forEach((ln, i) => put(ln, mid, yy + i * tLH, tf, ink, tLH, 'center')); yy += tl.length * tLH;
      al.forEach((ln, i) => put(ln, mid, yy + i * aLH, af, soft, aLH, 'center')); yy += al.length * aLH + gap;
      rr(g, ix, yy + 5, iw, 6, 3); g.fillStyle = rgba(t.text_color, 0.25); g.fill(); g.beginPath(); g.arc(ix + 7, yy + 8, 8, 0, 7); g.fillStyle = t.accent_color; g.fill(); yy += 16 + gap;
      const tf2 = F(400, 10.5); put('0:00', ix, yy, tf2, rgba(t.text_color, 0.6), 15.75); put('-0:00', ix + iw, yy, tf2, rgba(t.text_color, 0.6), 15.75, 'right'); yy += 15.75 - 6 + gap;
      const cy = yy + 20; g.fillStyle = ink;
      g.beginPath(); g.rect(mid - 47 - 6, cy - 7, 2.5, 14); g.moveTo(mid - 47 + 11, cy - 7); g.lineTo(mid - 47 + 11, cy + 7); g.lineTo(mid - 47 - 3, cy); g.fill();
      g.beginPath(); g.moveTo(mid - 7, cy - 10); g.lineTo(mid + 9, cy); g.lineTo(mid - 7, cy + 10); g.fill();
      g.beginPath(); g.rect(mid + 47 + 3.5, cy - 7, 2.5, 14); g.moveTo(mid + 47 - 11, cy - 7); g.lineTo(mid + 47 - 11, cy + 7); g.lineTo(mid + 47 + 3, cy); g.fill(); yy += 40 + gap;
      g.fillStyle = t.border_color; g.fillRect(ix, yy, iw, 1); const vy = yy + 8 + 14;
      g.fillStyle = ink; g.beginPath(); g.moveTo(ix + 3, vy - 3); g.lineTo(ix + 7, vy - 3); g.lineTo(ix + 12, vy - 8); g.lineTo(ix + 12, vy + 8); g.lineTo(ix + 7, vy + 3); g.lineTo(ix + 3, vy + 3); g.fill();
      const sx = ix + 28, sw = iw - 28 - 44; rr(g, sx, vy - 3, sw, 6, 3); g.fillStyle = rgba(t.text_color, 0.25); g.fill(); rr(g, sx, vy - 3, sw * 0.7, 6, 3); g.fillStyle = t.accent_color; g.fill();
      g.beginPath(); g.arc(sx + sw * 0.7, vy, 7, 0, 7); g.fillStyle = t.accent_color; g.fill(); put('70%', ix + iw, vy - 12, F(400, fs * 0.75), rgba(t.text_color, 0.7), 24, 'right');
      }, true);
    } };
  };
  const actionsBlock = (w) => {
    if (actions === 'none') return null; const bh = 44, sf = F(400, fs * 0.82), slh = fs * 0.82 * 1.5, h = bh + 10 + slh * 1.6;
    return { kind: 'actions', h, w, draw(x, y) {
      rr(g, x, y, w, bh, r3); g.fillStyle = t.accent_color; g.fill(); outline(x, y, w, bh, r3, t.accent_color, 1);
      put('Add friend', x + w / 2, y, F(800, fs), onAccent, bh, 'center');
      const ty = y + bh + 10, mid = x + w / 2, a = rgba(t.text_color, 0.75); const rw = wOf(sf, 'Report'), bwd = wOf(sf, 'Block'), tot = rw + 10 + wOf(sf, '·') + 10 + bwd, sx = mid - tot / 2;
      put('Report', sx, ty, sf, a, slh * 1.6); put('·', sx + rw + 10, ty, sf, a, slh * 1.6); put('Block', sx + rw + 20 + wOf(sf, '·'), ty, sf, a, slh * 1.6);
      g.fillStyle = a; g.fillRect(sx, ty + slh * 1.6 / 2 + fs * 0.36, rw, 1); g.fillRect(sx + rw + 20 + wOf(sf, '·'), ty + slh * 1.6 / 2 + fs * 0.36, bwd, 1);
    } };
  };

  /* place the sidebar blocks (inside the sidebar's own border + padding) */
  let sideBlocks, sideH;
  if (layout === 'single') {
    const w1 = Math.min(sidebar, sideInner), w2 = Math.max(0, sideInner - w1 - gapSide);
    const items = [[avatarBlock(w1)], [nameplateBlock(w2)], [headlineBlock(w1)], [playerBlock(w2)], [actionsBlock(w1)]].map(([b]) => b).filter(Boolean);
    const grid = []; items.forEach((b, i) => { const col = i % 2, row = Math.floor(i / 2); grid[row] = grid[row] || []; grid[row][col] = b; });
    let yy = 0; sideBlocks = [];
    grid.forEach((row) => { const rh = Math.max(...row.filter(Boolean).map((b) => b.h)); row.forEach((b, col) => { if (b) sideBlocks.push({ b, dx: col ? w1 + gapSide : 0, dy: yy }); }); yy += rh + gapSide; });
    sideH = Math.max(0, yy - gapSide);
  } else {
    const items = [avatarBlock(sideInner), nameplateBlock(sideInner), headlineBlock(sideInner), playerBlock(sideInner), actionsBlock(sideInner)].filter(Boolean);
    let yy = 0; sideBlocks = items.map((b) => { const o = { b, dx: 0, dy: yy }; yy += b.h + gapSide; return o; }); sideH = Math.max(0, yy - gapSide);
  }
  const sideBoxH = sideH + 2 * sidePB, cardsBoxH = cardsH + 2 * cardsPB;

  /* ---- page size ---- */
  const gridH = layout === 'single' ? sideBoxH + gapCol + cardsBoxH : Math.max(sideBoxH, cardsBoxH);
  const frameH = 2 * fbw + 2 * P + gridH;
  const CTA_H = 60, CTA_GAP = 30;
  const PW = FRAME_W + MARGIN * 2, PH = MARGIN + frameH + CTA_GAP + CTA_H + MARGIN;
  const S = Math.min(2, Math.sqrt(MAX_PIXELS / (PW * PH)));
  const out = mk(PW * S, PH * S);
  let g = styler.patch(out.getContext('2d'));                      // `let`: Fine-tune effects draw on a layer, then swap back
  g.scale(S, S); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const spots = new Map();
  const mkLayer = (w, h) => { const c = mk(w, h), get = c.getContext.bind(c); c.getContext = (...a) => styler.patch(get(...a)); return c; };
  const fx = createFx({ getG: () => g, setG: (v) => { g = v; }, mk: mkLayer, colors: { border: t.border_color, accent: t.accent_color }, unit: 1 });

  /* ---- page background: colour, image, dark overlay ---- */
  const base = mk(PW * S, PH * S), b = base.getContext('2d'); b.scale(S, S);
  b.fillStyle = t.bg_color; b.fillRect(0, 0, PW, PH);
  if (bg) {
    if (t.bg_repeat === 'cover' || !t.bg_repeat) drawCover(b, bg, 0, 0, PW, PH);
    else { const pat = b.createPattern(bg, t.bg_repeat); if (pat) { b.fillStyle = pat; b.fillRect(0, 0, PW, PH); } else drawCover(b, bg, 0, 0, PW, PH); }
  }
  if (overlay) { b.fillStyle = `rgba(0,0,0,${overlay})`; b.fillRect(0, 0, PW, PH); }
  g.drawImage(base, 0, 0, PW, PH);
  let glass = null;
  if (bg && blurPx > 0) {                                         // what backdrop-filter: blur() does behind the frame and the cards
    glass = mk(PW * S, PH * S); const gg = glass.getContext('2d');
    if ('filter' in gg) {
      const pad = blurPx * 2 * S; gg.filter = `blur(${blurPx * S}px)`; gg.drawImage(base, -pad, -pad, glass.width + pad * 2, glass.height + pad * 2); gg.filter = 'none';
    } else { const f = Math.max(2, blurPx); const sm = mk(glass.width / f, glass.height / f); sm.getContext('2d').drawImage(base, 0, 0, sm.width, sm.height); gg.imageSmoothingQuality = 'high'; gg.drawImage(sm, 0, 0, glass.width, glass.height); }
  }

  /* ---- drawing primitives (CSS px) ---- */
  function panel(x, y, w, h, radius, color, alpha) {
    g.save(); rr(g, x, y, w, h, radius); g.clip(); if (glass) g.drawImage(glass, 0, 0, PW, PH); g.fillStyle = rgba(color, alpha); g.fillRect(x, y, w, h); g.restore();
  }
  function fillRR(x, y, w, h, radius, color, alpha) { rr(g, x, y, w, h, radius); g.fillStyle = rgba(color, alpha); g.fill(); }
  function outline(x, y, w, h, radius, color, width, style = t.border_style || 'solid') {
    if (!width) return;
    g.save(); g.strokeStyle = color; g.lineJoin = 'round';
    const stroke = (inset, lw) => { rr(g, x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(0, radius - inset)); g.lineWidth = lw; g.stroke(); };
    if (style === 'double' && width >= 3) { const th = Math.max(1, Math.round(width / 3)); stroke(th / 2, th); stroke(width - th / 2, th); }
    else { if (style === 'dashed') g.setLineDash([width * 3.5, width * 2.2]); else if (style === 'dotted') { g.setLineDash([0.1, width * 1.8]); g.lineCap = 'round'; } stroke(width / 2, width); }
    g.restore();
  }
  /** One rule target drawn as a box: its fill, border and the Fine-tune effects (tilt, opacity, filter, shadow) around whatever `draw` paints inside. */
  function wrap(E, rect, draw, glassy = false, shadowKind) {
    const box = { x: rect.x, y: rect.y, w: rect.w, h: rect.h, r: E.r };
    fx.group(box, E.b, () => {
      if (E.bg) (glassy ? panel : fillRR)(box.x, box.y, box.w, box.h, E.r, E.bg[0], E.bg[1]);
      outline(box.x, box.y, box.w, box.h, E.r, E.color, E.bw, E.style);
      draw();
    }, shadowKind);
  }
  const baseCache = new Map();
  const baselineOf = (font, lh) => {                                // baseline of a CSS line box (content area centred in the line height)
    const key = `${font}|${styler.key()}`;
    if (!baseCache.has(key)) { meas.font = font; const m = meas.measureText('Hg'); const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(meas.font)?.[1]) || 16; baseCache.set(key, [m.fontBoundingBoxAscent ?? px * 0.8, m.fontBoundingBoxDescent ?? px * 0.2]); }
    const [a, d] = baseCache.get(key); return (lh - (a + d)) / 2 + a;
  };
  function put(text, x, y, font, color, lh = LH, align = 'left') {
    g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic'; g.fillText(text, x, y + baselineOf(font, lh));
  }
  function badgeAt(cx, cy, rad) {
    g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fillStyle = VERIFIED_BLUE; g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = rad * 0.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(cx - rad * 0.42, cy + rad * 0.04); g.lineTo(cx - rad * 0.1, cy + rad * 0.36); g.lineTo(cx + rad * 0.46, cy - rad * 0.3); g.stroke();
  }
  /** Picture in a rounded box; initial letter when there is no image. edge = outline colour or null. */
  function pic(im, x, y, w, h, radius, letter, edge) {
    g.save(); rr(g, x, y, w, h, radius); g.clip();
    if (im) drawCover(g, im, x, y, w, h); else { g.fillStyle = rgba(t.accent_color, 0.22); g.fillRect(x, y, w, h); }
    g.restore();
    if (!im && letter) put(letter, x + w / 2, y, F(800, Math.min(w, h) * 0.45, nameStack), ink, h, 'center');
    if (edge) outline(x, y, w, h, radius, edge, bw);
  }

  /* ---- frame (everything inside it is drawn on the frame's own layer, so its tilt / filter / opacity apply to all of it) ---- */
  const FX = MARGIN, FY = MARGIN;
  const gx = FX + fbw + P, gy = FY + fbw + P;
  const sideX = layout === 'side-right' ? gx + cardsW + 1 + 2 * gapCol : gx;
  const cardsX = layout === 'side-left' ? gx + sidebar + 1 + 2 * gapCol : gx;
  const cardsY = layout === 'single' ? gy + sideBoxH + gapCol : gy;
  // the sidebar and the card column are grid cells: in the two-column layouts both stretch to the full height of the grid
  const sideRect = layout === 'single' ? { x: sideX, y: gy, w: CW, h: sideBoxH } : { x: sideX, y: gy, w: sidebar, h: gridH };
  const cardsRect = layout === 'single' ? { x: cardsX, y: cardsY, w: CW, h: cardsBoxH } : { x: cardsX, y: gy, w: cardsW, h: gridH };
  const cardsX0 = cardsX + cardsPB, cardsY0 = cardsY + cardsPB;

  wrap(FR, { x: FX, y: FY, w: FRAME_W, h: frameH }, () => {
    wrap(SD, sideRect, () => sideBlocks.forEach(({ b: blk, dx, dy }) => blk.draw(sideRect.x + sidePB + dx, sideRect.y + sidePB + dy)));
    if (layout !== 'single') { g.fillStyle = t.border_color; const dx = layout === 'side-left' ? gx + sidebar + gapCol : gx + cardsW + gapCol; g.fillRect(dx, gy, 1, gridH); }
    wrap(CS, cardsRect, () => {
      let yy = cardsRect.y + cardsPB;
      cardBlocks.forEach((c) => { spots.set(c.id, { x: cardsX0, y: yy, w: cardsInner, h: c.h }); c.draw(cardsX0, yy, cardsInner); yy += c.h + gapCards; });
    });

    /* ---- stickers: pinned to the avatar / their card, same maths as the page ---- */
    stickers.map((s, i) => ({ s, im: stickerImgs[i] })).filter((o) => o.im).sort((a, c) => (a.s.z || 0) - (c.s.z || 0)).forEach(({ s, im }) => {
      const sp = spots.get(s.card), ux = (sp ? sp.w : cardsInner) / 1000, sw = s.w * ux, sh = s.h * ux, sx = (sp ? sp.x : cardsX0) + s.x * ux;
      const sy = sp ? (s.v === 'b' ? sp.y + sp.h - s.y * ux - sh : sp.y + s.y * ux) : (s.v === 'b' ? cardsY0 + cardsH - s.y * ux - sh : cardsY0 + s.y * ux);
      g.save(); g.translate(sx + sw / 2, sy + sh / 2); g.rotate(((s.rotation || 0) * Math.PI) / 180); drawContain(g, im, -sw / 2, -sh / 2, sw, sh); g.restore();
    });
  }, true, FR.b.shadow ?? t.shadow);                                // the theme's frame shadow unless Fine-tune picks another

  /* ---- Whole page: filter / opacity apply to everything drawn so far (the call-to-action below is not part of the profile) ---- */
  fx.wholeCanvas(css.box('page'));
  styler.set(null);

  /* ---- call to action under the frame ---- */
  {
    const l1 = 'Find me on fiiyou', url = profileUrl(slug).replace(/^https?:\/\//, ''), f1 = F(700, 19, nameStack), f2 = F(500, 13.5);
    const cw = clamp(Math.max(wOf(f1, l1), wOf(f2, url)) + 64, 300, FRAME_W), cx = Math.round((PW - cw) / 2), cy = FY + frameH + CTA_GAP;
    panel(cx, cy, cw, CTA_H, CTA_H / 2, t.frame_color, Math.max(frameAlpha, 0.6)); outline(cx, cy, cw, CTA_H, CTA_H / 2, rgba(t.accent_color, 0.4), 1.2);
    put(l1, PW / 2, cy + 8, f1, rgba(t.text_color, 0.9), 26, 'center'); put(url, PW / 2, cy + 33, f2, rgba(t.text_color, 0.5), 20, 'center');
  }

  void contrastOf; void cardOver;
  return out;
}
