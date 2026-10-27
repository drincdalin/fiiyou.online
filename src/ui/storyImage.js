import { FONT_STACKS, THEME_DEFAULTS } from './theme.js';
import { onColor, VERIFIED_BLUE } from './appTheme.js';

/* ======================================================================
   storyImage.js: exports a profile as a 1080x1920 (9:16) story image.

   It mirrors the real profile page: same theme (colours, radius, border
   width/style, shadow, glass blur, fonts, name case), the same cards in
   the same order (about, text, gallery, links, interests, top friends,
   guestbook), the music player and the stickers.

   Everything has to fit on ONE canvas, so the layout is measured first and
   then degraded step by step if it is too tall (fewer gallery rows, shorter
   texts, fewer guestbook entries ...), and cards from the end are dropped
   only as a last resort.

   Instagram / TikTok cover the top ~190px and the bottom ~190px of a story
   with their own UI, so everything important stays inside SAFE_TOP..SAFE_BOT.
   ====================================================================== */

/** Canvas cannot resolve CSS variables, so 'default' / 'custom' need a concrete stack here (same fonts as --ui-font in styles.css). */
const UI_STACK = '"Ubuntu Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const canvasStack = (key, customFamily) => (key === 'custom'
  ? (customFamily ? `"${customFamily}", ${UI_STACK}` : UI_STACK)
  : (FONT_STACKS[key] === 'var(--ui-font)' ? UI_STACK : FONT_STACKS[key]) || UI_STACK);

const W = 1080, H = 1920;
const SAFE_TOP = 190, SAFE_BOT = 1730;
const SIDE = 48;                    // gap between canvas edge and frame
const FW = W - SIDE * 2;            // frame width
const WEB_FRAME_W = 1210;           // width of the profile frame in the web app (sticker coordinates live in this space)

export const SHARE_ORIGIN = 'https://app.fiiyou.online';
/** Short profile links: app.fiiyou.online/<username>. App.jsx parseHash() understands this path (the host must serve index.html for unknown paths). */
const SHARE_PATH = '/';
export const profileUrl = (slug) => `${SHARE_ORIGIN}${SHARE_PATH}${encodeURIComponent(slug)}`;
const displayUrl = (slug) => profileUrl(slug).replace(/^https?:\/\//, '');

/* ---------------------------------------------------------------- helpers */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

const loadImg = (src) => new Promise((res) => {
  if (!src) return res(null);
  const i = new Image(); i.crossOrigin = 'anonymous';
  i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
});

const rgbOf = (h) => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return [0, 0, 0];
  let s = m[1]; if (s.length === 3) s = [...s].map((c) => c + c).join('');
  const n = parseInt(s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (h, a) => { const [r, g, b] = rgbOf(h); return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`; };

/** Adds a rounded-rect subpath (no beginPath). */
function rrp(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function rr(g, x, y, w, h, r) { g.beginPath(); rrp(g, x, y, w, h, r); }

function drawCover(g, img, x, y, w, h) {
  const k = Math.max(w / img.width, h / img.height), dw = img.width * k, dh = img.height * k;
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function drawContain(g, img, x, y, w, h) {
  const k = Math.min(w / img.width, h / img.height), dw = img.width * k, dh = img.height * k;
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Cheap blur that works everywhere (ctx.filter is not available on every Safari): shrink, then scale back up smoothed. */
function blurred(src, factor) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(W / factor)); c.height = Math.max(1, Math.round(H / factor));
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function ellipsize(g, s, maxW) {
  s = String(s || ''); if (g.measureText(s).width <= maxW) return s;
  let l = s; while (l && g.measureText(`${l}…`).width > maxW) l = l.slice(0, -1);
  return `${l.trimEnd()}…`;
}

/** Word-wraps text (keeps line breaks, breaks very long words). g.font must already be set. Returns at most maxLines lines. */
function wrap(g, text, maxW, maxLines) {
  const out = [];
  for (const para of String(text || '').replace(/\r/g, '').split('\n')) {
    if (!para.trim()) { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
    let cur = '';
    for (let w of para.split(/\s+/).filter(Boolean)) {
      while (g.measureText(w).width > maxW && w.length > 1) {
        let i = w.length; while (i > 1 && g.measureText(w.slice(0, i)).width > maxW) i--;
        if (cur) { out.push(cur); cur = ''; }
        out.push(w.slice(0, i)); w = w.slice(i);
      }
      const t = cur ? `${cur} ${w}` : w;
      if (g.measureText(t).width <= maxW) cur = t; else { if (cur) out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  if (out.length > maxLines) { out.length = maxLines; let l = out[maxLines - 1]; while (l && g.measureText(`${l}…`).width > maxW) l = l.slice(0, -1); out[maxLines - 1] = `${l.trimEnd()}…`; }
  return out;
}

function checkBadge(g, cx, cy, r) {
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = VERIFIED_BLUE; g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = r * 0.2; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(cx - r * 0.42, cy + r * 0.04); g.lineTo(cx - r * 0.1, cy + r * 0.36); g.lineTo(cx + r * 0.46, cy - r * 0.3); g.stroke();
}

/* ------------------------------------------------------------------- main */

/**
 * @param profile   { username, display_name, headline, locality, verified, friends, views }
 * @param theme     the profile theme object (same one the page uses)
 * @param cards     visible flow cards in page order: [{ id, type, title, content }]   (no music / sticker cards)
 * @param photos    [{ src }]            gallery photos (first 8 are drawn)
 * @param topFriends [{ name, src }]     top friends (first 8 are drawn)
 * @param guestbook [{ name, username, body }]  latest guestbook entries (first 3 are drawn)
 * @param stickers  [{ src, x, y, w, h, rotation, z }]  in the web frame's coordinate space
 * @param music     { title, artist, coverSrc } | null
 * @param interests legacy fallback, only used when `cards` is empty
 * @param fontFamily CSS family of the person's uploaded font (from useCustomFont / loadFont), used when theme.font / name_font is 'custom'
 */
export async function renderStory({
  profile, theme, avatarSrc, bgSrc, music = null, interests = [], cards = [], photos = [], topFriends = [], guestbook = [], stickers = [], slug = profile.username, fontFamily = null,
}) {
  const t = { ...THEME_DEFAULTS, ...(theme || {}) };
  const nameStack = canvasStack(t.name_font, fontFamily);
  const bodyStack = canvasStack(t.font, fontFamily);

  try {
    await document.fonts.ready;
    await Promise.all([500, 600, 700, 800].map((w) => document.fonts.load(`${w} 30px ${bodyStack}`)).concat(document.fonts.load(`800 52px ${nameStack}`)));
  } catch { /* fonts are best effort */ }

  const shownPhotos = photos.slice(0, 12), shownFriends = topFriends.slice(0, 8), shownGuest = guestbook.slice(0, 3);
  const [avatar, bg, cover, photoImgs, friendImgs, stickerImgs] = await Promise.all([
    loadImg(avatarSrc), loadImg(bgSrc), loadImg(music?.coverSrc),
    Promise.all(shownPhotos.map((p) => loadImg(p.src))), Promise.all(shownFriends.map((f) => loadImg(f.src))), Promise.all(stickers.map((s) => loadImg(s.src))),
  ]);

  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';

  /* ---- theme -> story-scale metrics (the web values are for ~1200px wide, the story is 1080 but read on a phone, so everything is a bit bigger) ---- */
  const bw = clamp(num(t.border_width, 1), 0, 6), lw = bw === 0 ? 0 : Math.max(2, Math.round(bw * 1.8));
  const step = num(t.step, 8);
  const r1 = clamp(num(t.radius, 14) * 1.5, 0, 64), r2 = Math.max(0, r1 - step * 1.5), r3 = Math.max(0, r1 - step * 3);
  const base = clamp(Math.round(num(t.font_size, 15) * 1.7), 22, 32);
  const cardAlpha = clamp(num(t.card_opacity, 100) / 100, 0, 1), frameAlpha = clamp(num(t.frame_opacity, 100) / 100, 0, 1);
  const blurPx = num(t.blur, 0), overlay = clamp(num(t.overlay, 0) / 100, 0, 1);
  const cardGap = clamp(Math.round(num(t.card_gap, 20) * 0.95), 12, 30);
  const fpad = clamp(Math.round(step * 3 * 1.3), 24, 40), cpad = clamp(Math.round(step * 2 * 1.4), 20, 32);
  const CW = FW - fpad * 2, CIW = CW - cpad * 2;     // content width of the frame / of a card
  const ink = t.text_color, soft = rgba(t.text_color, 0.62);
  const caseOf = (s) => (t.name_case === 'upper' ? s.toUpperCase() : t.name_case === 'lower' ? s.toLowerCase() : s);
  const onAccent = onColor(rgbOf(t.accent_color));
  const initial = (s) => String(s || '?').trim().charAt(0).toUpperCase() || '?';
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  /* ---- background: colour, image, dim. This is also what the frame "glass" blurs ---- */
  const baseBg = document.createElement('canvas'); baseBg.width = W; baseBg.height = H;
  { const b = baseBg.getContext('2d'); b.fillStyle = t.bg_color; b.fillRect(0, 0, W, H);
    if (bg) drawCover(b, bg, 0, 0, W, H);
    if (overlay) { b.fillStyle = `rgba(0,0,0,${overlay})`; b.fillRect(0, 0, W, H); } }
  g.drawImage(baseBg, 0, 0);
  const glass = bg && blurPx > 0 ? blurred(baseBg, clamp(blurPx * 0.9 + 2, 3, 24)) : null;

  /* ---- drawing primitives shared by frame, cards, tiles ---- */
  function panel(x, y, w, h, r, color, alpha) {
    g.save(); rr(g, x, y, w, h, r); g.clip();
    if (glass) g.drawImage(glass, 0, 0, W, H);
    g.fillStyle = rgba(color, alpha); g.fillRect(x, y, w, h); g.restore();
  }
  function outline(x, y, w, h, r, color, width = lw) {
    if (!width) return;
    const style = t.border_style || 'solid';
    g.save(); g.strokeStyle = color; g.lineJoin = 'round';
    const stroke = (inset, lwid) => { rr(g, x + inset, y + inset, w - inset * 2, h - inset * 2, Math.max(0, r - inset)); g.lineWidth = lwid; g.stroke(); };
    if (style === 'double' && width >= 3) { const th = Math.max(1, Math.round(width / 3)); stroke(th / 2, th); stroke(width - th / 2, th); }
    else {
      if (style === 'dashed') g.setLineDash([width * 3.5, width * 2.2]);
      else if (style === 'dotted') { g.setLineDash([0.1, width * 1.8]); g.lineCap = 'round'; }
      stroke(width / 2, width);
    }
    g.restore();
  }
  /** Box shadow outside the frame only (CSS box-shadow is not painted under the box, so the glass stays clean). */
  function frameShadow(x, y, w, h, r) {
    if (!t.shadow || t.shadow === 'none') return;
    const OFF = 4000;
    g.save(); g.beginPath(); g.rect(0, 0, W, H); rrp(g, x, y, w, h, r); g.clip('evenodd');
    g.beginPath(); rrp(g, x - OFF, y, w, h, r);
    if (t.shadow === 'hard') { g.shadowColor = t.border_color; g.shadowBlur = 0; g.shadowOffsetX = OFF + 12; g.shadowOffsetY = 12; }
    else { g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 60; g.shadowOffsetX = OFF; g.shadowOffsetY = 22; }
    g.fillStyle = '#000'; g.fill(); g.restore();
  }
  const text = (s, x, y, font, color, align = 'left') => { g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'top'; g.fillText(s, x, y); };
  const initialTile = (x, y, size, r, ch) => {
    g.save(); rr(g, x, y, size, size, r); g.clip(); g.fillStyle = rgba(t.accent_color, 0.22); g.fillRect(x, y, size, size); g.restore();
    g.font = `800 ${Math.round(size * 0.42)}px ${nameStack}`; g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, x + size / 2, y + size / 2 + 2);
  };
  const inner = (h, paint) => ({ h, paint });

  /* ---- card chrome: panel + border + title, with a measured inner block ---- */
  const TITLE_SIZE = Math.round(base * 1.05), TITLE_H = Math.round(TITLE_SIZE * 1.25) + 8;
  function card(title, body) {
    const th = title ? TITLE_H : 0, h = cpad * 2 + th + body.h;
    return { h, draw(x, y, w) {
      panel(x, y, w, h, r2, t.card_color, cardAlpha); outline(x, y, w, h, r2, t.border_color);
      if (title) { g.font = `700 ${TITLE_SIZE}px ${bodyStack}`; text(ellipsize(g, title, w - cpad * 2), x + cpad, y + cpad, g.font, ink); }
      body.paint(x + cpad, y + cpad + th, w - cpad * 2);
    } };
  }

  /* ---- pill flow (interests, links) ---- */
  function flow(labels, maxRows, { color, border }) {
    const fs = base - 2, ph = Math.round(fs * 1.9), padX = 20, gap = 10, font = `600 ${fs}px ${bodyStack}`;
    g.font = font;
    const items = []; let x = 0, row = 0;
    for (const l of labels) {
      const s = ellipsize(g, l, CIW - padX * 2), w = Math.min(CIW, g.measureText(s).width + padX * 2);
      if (x + w > CIW && x > 0) { row++; x = 0; }
      if (row >= maxRows) break;
      items.push({ s, x, row, w }); x += w + gap;
    }
    let hidden = labels.length - items.length;
    if (hidden > 0 && items.length) {
      const mw = () => g.measureText(`+${hidden}`).width + padX * 2;
      while (items.length > 1) { const l = items[items.length - 1]; if (l.x + l.w + gap + mw() <= CIW) break; items.pop(); hidden = labels.length - items.length; }
      const l = items[items.length - 1]; items.push({ s: `+${hidden}`, x: l.x + l.w + gap, row: l.row, w: mw(), more: true });
    }
    const rows = items.length ? items[items.length - 1].row + 1 : 0;
    return inner(rows * ph + Math.max(0, rows - 1) * gap, (ox, oy) => {
      for (const it of items) {
        const px = ox + it.x, py = oy + it.row * (ph + gap), pr = Math.min(r3, ph / 2);
        if (!it.more && color !== ink) { rr(g, px, py, it.w, ph, pr); g.fillStyle = rgba(color, 0.1); g.fill(); }
        outline(px, py, it.w, ph, pr, it.more ? rgba(t.border_color, 1) : border, Math.max(1, Math.min(lw, 3)));
        g.font = font; g.fillStyle = it.more ? soft : color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(it.s, px + it.w / 2, py + ph / 2 + 1);
      }
    });
  }

  /* ------------------------------------------------------- card makers: each returns { levels, make(level) -> card } or null */
  const makers = {
    about: textBlock, text: textBlock,
    interests: (c) => { const l = (c.content?.interests || []).filter(Boolean); if (!l.length) return null;
      return { levels: 3, make: (lv) => card(c.title, flow(l, [1, 2, 4][lv], { color: ink, border: t.border_color })) }; },
    links: (c) => { const l = (c.content?.links || []).map((x) => x.label || String(x.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '')).filter(Boolean); if (!l.length) return null;
      return { levels: 3, make: (lv) => card(c.title, flow(l, [1, 2, 4][lv], { color: t.link_color, border: rgba(t.link_color, 0.55) })) }; },
    gallery: (c) => { if (!photos.length) return null;
      return { levels: 2, make: (lv) => {
        const cols = 6, gap = 10, rows = lv ? 2 : 1, tile = Math.floor((CIW - gap * (cols - 1)) / cols);
        const count = Math.min(photos.length, cols * rows, shownPhotos.length), nrows = Math.ceil(count / cols), extra = photos.length - count;
        return card(c.title, inner(nrows * tile + (nrows - 1) * gap, (x, y) => {
          for (let i = 0; i < count; i++) {
            const tx = x + (i % cols) * (tile + gap), ty = y + Math.floor(i / cols) * (tile + gap), im = photoImgs[i];
            g.save(); rr(g, tx, ty, tile, tile, Math.min(r3, tile / 2)); g.clip();
            if (im) drawCover(g, im, tx, ty, tile, tile); else { g.fillStyle = rgba(t.accent_color, 0.15); g.fillRect(tx, ty, tile, tile); }
            if (extra > 0 && i === count - 1) { g.fillStyle = 'rgba(0,0,0,0.58)'; g.fillRect(tx, ty, tile, tile);
              g.font = `800 ${base}px ${nameStack}`; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`+${extra + 1}`, tx + tile / 2, ty + tile / 2 + 2); }
            g.restore(); outline(tx, ty, tile, tile, Math.min(r3, tile / 2), t.border_color, Math.min(lw, 2));
          }
        })); } }; },
    top_friends: (c) => { if (!topFriends.length) return null;
      return { levels: 2, make: (lv) => {
        const cols = lv ? 6 : 8, gap = 14, rowGap = 16, cell = Math.floor((CIW - gap * (cols - 1)) / cols), av = Math.min(cell, 92), ns = base - 7, labelH = Math.round(ns * 1.4), rowH = av + 8 + labelH;
        const count = Math.min(shownFriends.length, cols * (lv ? 2 : 1)), nrows = Math.ceil(count / cols);
        return card(c.title, inner(nrows * rowH + (nrows - 1) * rowGap, (x, y) => {
          for (let i = 0; i < count; i++) {
            const cx0 = x + (i % cols) * (av + gap), cy0 = y + Math.floor(i / cols) * (rowH + rowGap), ax = cx0, im = friendImgs[i], f = shownFriends[i];
            if (im) { g.save(); rr(g, ax, cy0, av, av, Math.min(r3, av / 2)); g.clip(); drawCover(g, im, ax, cy0, av, av); g.restore(); } else initialTile(ax, cy0, av, Math.min(r3, av / 2), initial(f.name));
            outline(ax, cy0, av, av, Math.min(r3, av / 2), t.border_color, Math.min(lw, 2));
            g.font = `600 ${ns}px ${bodyStack}`; text(ellipsize(g, f.name || '', av + gap - 2), cx0 + av / 2, cy0 + av + 8, g.font, ink, 'center');
          }
        })); } }; },
    guestbook: (c) => {
      if (!shownGuest.length) return { levels: 1, make: () => card(c.title, inner(60, (x, y, w) => {            // empty wall: show the input like the real page does
        const bw2 = 130, iw = w - bw2 - 14;
        g.save(); rr(g, x, y, iw, 60, r3); g.fillStyle = rgba(t.card_color, 0.9); g.fill(); g.restore(); outline(x, y, iw, 60, r3, t.border_color, Math.min(lw, 2));
        text('Write something…', x + 20, y + 16, `500 ${base - 2}px ${bodyStack}`, rgba(t.text_color, 0.4));
        rr(g, x + iw + 14, y, bw2, 60, r3); g.fillStyle = t.accent_color; g.fill();
        g.font = `700 ${base - 2}px ${bodyStack}`; g.fillStyle = onAccent; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Send', x + iw + 14 + bw2 / 2, y + 31);
      })) };
      return { levels: shownGuest.length, make: (lv) => {
        const n = lv + 1, AV = 48, tx = AV + 16, tw = CIW - tx, fs = base - 2, lh = Math.round(fs * 1.4), nameH = Math.round(fs * 1.35), lines = lv === 0 && shownGuest.length > 1 ? 1 : 2, gap = 20;
        g.font = `500 ${fs}px ${bodyStack}`;
        const ents = shownGuest.slice(0, n).map((e) => { const ls = wrap(g, e.body, tw, lines); return { e, ls, h: Math.max(AV, nameH + 4 + ls.length * lh) }; });
        return card(c.title, inner(ents.reduce((a, b) => a + b.h, 0) + (ents.length - 1) * gap, (x, y) => {
          let yy = y;
          for (const { e, ls, h } of ents) {
            initialTile(x, yy, AV, AV / 2, initial(e.name));
            g.font = `700 ${fs}px ${bodyStack}`; const nm = ellipsize(g, e.name || e.username || '', tw * 0.7); text(nm, x + tx, yy, g.font, ink);
            const nw = g.measureText(nm).width; g.font = `500 ${fs - 4}px ${bodyStack}`;
            if (e.username && nw + 14 < tw * 0.95) text(ellipsize(g, `@${e.username}`, tw - nw - 14), x + tx + nw + 12, yy + 3, g.font, soft);
            ls.forEach((l, i) => text(l, x + tx, yy + nameH + 4 + i * lh, `500 ${fs}px ${bodyStack}`, rgba(t.text_color, 0.88)));
            yy += h + gap;
          }
        })); } }; },
  };

  function textBlock(c) {
    const body = c.content?.body; if (!String(body || '').trim()) return null;
    return { levels: 3, make: (lv) => {
      g.font = `500 ${base}px ${bodyStack}`;
      const lines = wrap(g, body, CIW, [4, 7, 12][lv]), lh = Math.round(base * 1.45), ys = []; let yy = 0;
      for (const s of lines) { ys.push(yy); yy += s ? lh : Math.round(lh * 0.6); }
      return card(c.title, inner(yy, (x, y) => lines.forEach((s, i) => s && text(s, x, y + ys[i], `500 ${base}px ${bodyStack}`, ink))));
    } };
  }

  /* ----------------------------------------------- header: ONE row = [ avatar | name plate | music player ], all the same height (mirrored for side-right) */
  const hasMusic = !!(music && (music.title || music.artist));

  /** Mini player filling the row height: cover + title/artist on top, play button + progress bar underneath. */
  function drawMusic(x, y, w, h) {
    const pad = 16, COV = 104, PLAY = 52;
    panel(x, y, w, h, r2, t.card_color, cardAlpha); outline(x, y, w, h, r2, t.border_color);
    const cx0 = x + pad, cy0 = y + pad;
    if (cover) { g.save(); rr(g, cx0, cy0, COV, COV, r3); g.clip(); drawCover(g, cover, cx0, cy0, COV, COV); g.restore(); }
    else { g.save(); rr(g, cx0, cy0, COV, COV, r3); g.fillStyle = rgba(t.accent_color, 0.2); g.fill(); g.restore(); g.font = `700 40px ${bodyStack}`; g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('♪', cx0 + COV / 2, cy0 + COV / 2 + 2); }
    const tx = cx0 + COV + 14, tw = x + w - pad - tx;
    g.font = `700 ${base - 2}px ${bodyStack}`; text(ellipsize(g, music.title || 'Unknown title', tw), tx, cy0 + 8, g.font, ink);
    g.font = `500 ${base - 5}px ${bodyStack}`; if (music.artist) text(ellipsize(g, music.artist, tw), tx, cy0 + 8 + Math.round(base * 1.25), g.font, soft);
    const py = y + h - pad - PLAY / 2, bx = cx0 + PLAY + 16, bwid = x + w - pad - bx;
    g.beginPath(); g.arc(cx0 + PLAY / 2, py, PLAY / 2, 0, Math.PI * 2); g.fillStyle = t.accent_color; g.fill();
    const px = cx0 + PLAY / 2 + 2; g.beginPath(); g.moveTo(px - 8, py - 12); g.lineTo(px + 13, py); g.lineTo(px - 8, py + 12); g.closePath(); g.fillStyle = onAccent; g.fill();
    rr(g, bx, py - 4, bwid, 8, 4); g.fillStyle = rgba(t.text_color, 0.18); g.fill(); rr(g, bx, py - 4, bwid * 0.38, 8, 4); g.fillStyle = t.accent_color; g.fill();
  }

  function makeHeader() {
    const GAP = 18, padY = 14, padX = 18, verified = !!profile.verified;
    const AVW = hasMusic ? 210 : 220, AVH = Math.round(AVW * 250 / 220);        // fixed aspect ratio (220:250): the avatar is never stretched
    const PW = hasMusic ? clamp(CW - AVW - GAP * 2 - 300, 280, 330) : 0;        // player width
    const nw = CW - AVW - GAP - (hasMusic ? PW + GAP : 0);                      // name plate width
    const rawName = caseOf(profile.display_name || profile.username || 'user');
    const maxNameW = nw - padX * 2 - (verified ? 52 : 0);
    let ns = 46; const nf = (s) => `800 ${s}px ${nameStack}`;
    g.font = nf(ns); while (ns > 28 && g.measureText(rawName).width > maxNameW) { ns -= 2; g.font = nf(ns); }
    const nameText = ellipsize(g, rawName, maxNameW), nameW = g.measureText(nameText).width;
    const hs = base - 4; g.font = `600 ${hs}px ${bodyStack}`;
    const handle = ellipsize(g, `@${profile.username}${profile.locality ? ` · ${profile.locality}` : ''}`, nw - padX * 2);
    const fr = profile.friends ?? profile.friends_count, vw = profile.views;
    const stats = [fr !== undefined && fr !== null ? plural(fr, 'friend') : '', vw !== undefined && vw !== null ? plural(vw, 'view') : ''].filter(Boolean).join(' · ');
    const l1 = Math.round(ns * 1.25), l2 = Math.round(hs * 1.4), l3 = stats ? Math.round((base - 6) * 1.4) : 0;
    const hfs = base - 3, hlh = Math.round(hfs * 1.42); g.font = `500 ${hfs}px ${bodyStack}`;
    const hl = wrap(g, profile.headline || '', nw - padX * 2, 2);
    const blockH = l1 + 6 + l2 + (l3 ? 4 + l3 : 0) + (hl.length ? 14 + hl.length * hlh : 0);
    const h = Math.max(AVH, blockH + padY * 2);                                  // row height; every item in the row is this tall, the avatar keeps AVW x AVH and is centred
    return { h, draw(x, y, w) {
      const flip = t.layout === 'side-right';
      const ax = flip ? x + w - AVW : x, ay = y + Math.round((h - AVH) / 2);
      const nx = flip ? (hasMusic ? x + PW + GAP : x) : x + AVW + GAP, mx = flip ? x : nx + nw + GAP;
      g.save(); rr(g, ax, ay, AVW, AVH, r2); g.clip();
      if (avatar) drawCover(g, avatar, ax, ay, AVW, AVH); else { g.fillStyle = rgba(t.accent_color, 0.2); g.fillRect(ax, ay, AVW, AVH); }
      g.restore();
      if (!avatar) { g.font = `800 ${Math.round(AVW * 0.38)}px ${nameStack}`; g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(initial(profile.display_name || profile.username), ax + AVW / 2, ay + AVH / 2 + 4); }
      outline(ax, ay, AVW, AVH, r2, t.accent_color);
      panel(nx, y, nw, h, r2, t.card_color, cardAlpha); outline(nx, y, nw, h, r2, t.border_color);
      const mid = nx + nw / 2, bd = ns * 0.62, total = nameW + (verified ? 12 + bd : 0), top = y + Math.round((h - blockH) / 2);
      // Centre name and badge on the capital letters (not the line box): draw on the baseline, badge at half cap height above it.
      g.font = nf(ns); const capH = g.measureText('H').actualBoundingBoxAscent || ns * 0.7;
      const baseY = top + l1 / 2 + capH / 2;
      g.fillStyle = ink; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(nameText, mid - total / 2, baseY);
      if (verified) checkBadge(g, mid - total / 2 + nameW + 12 + bd / 2, baseY - capH / 2, bd / 2);
      let yy = top + l1 + 6;
      text(handle, mid, yy, `600 ${hs}px ${bodyStack}`, soft, 'center'); yy += l2 + 4;
      if (stats) { text(stats, mid, yy, `500 ${base - 6}px ${bodyStack}`, rgba(t.text_color, 0.5), 'center'); yy += l3; }
      hl.forEach((l, i) => text(l, mid, yy + 14 + i * hlh, `500 ${hfs}px ${bodyStack}`, rgba(t.text_color, 0.78), 'center'));
      if (hasMusic) drawMusic(mx, y, PW, h);
    } };
  }

  /* ------------------------------------------------------------ layout: measure, degrade until it fits, then draw */
  const CTA_H = 104, CTA_GAP = 32;
  const maxFrame = SAFE_BOT - SAFE_TOP - CTA_H - CTA_GAP, maxContent = maxFrame - fpad * 2;

  const header = makeHeader();
  const flowCards = cards.length ? cards : (interests.length ? [{ id: 'interests', type: 'interests', title: 'Interests', content: { interests } }] : []);
  const RANK = { guestbook: 1, links: 2, top_friends: 3, interests: 4, gallery: 5, text: 6, about: 7 };   // higher = kept longer when space runs out
  let blocks = flowCards.map((c) => { const m = makers[c.type]?.(c); return m && { ...m, rank: RANK[c.type] ?? 0 }; }).filter(Boolean);
  let lv = blocks.map((b) => b.levels - 1), built = blocks.map((b, i) => b.make(lv[i]));
  const fixedH = header.h;
  const contentH = () => fixedH + built.reduce((a, b) => a + cardGap + b.h, 0);
  while (contentH() > maxContent && built.length) {
    let idx = -1, best = -1; built.forEach((b, i) => { if (lv[i] > 0 && b.h > best) { best = b.h; idx = i; } });
    if (idx >= 0) { lv[idx]--; built[idx] = blocks[idx].make(lv[idx]); }
    else {                                                  // nothing left to shrink: drop the least important card (guestbook first, text/about last)
      let drop = 0; for (let i = 0; i < blocks.length; i++) if (blocks[i].rank <= blocks[drop].rank) drop = i;
      blocks.splice(drop, 1); lv.splice(drop, 1); built.splice(drop, 1);
    }
  }

  const frameH = Math.min(maxFrame, contentH() + fpad * 2), groupH = frameH + CTA_GAP + CTA_H;
  const FX = SIDE, FY = Math.round(SAFE_TOP + (SAFE_BOT - SAFE_TOP - groupH) / 2);

  frameShadow(FX, FY, FW, frameH, r1);
  panel(FX, FY, FW, frameH, r1, t.frame_color, frameAlpha); outline(FX, FY, FW, frameH, r1, t.border_color);

  let y = FY + fpad; const x = FX + fpad;
  header.draw(x, y, CW); y += header.h + cardGap;
  for (const b of built) { b.draw(x, y, CW); y += b.h + cardGap; }

  /* ---- stickers sit on top of the frame, in the web frame's coordinate space scaled to the story ---- */
  const k = FW / WEB_FRAME_W;
  stickers.map((s, i) => ({ s, im: stickerImgs[i] })).filter((o) => o.im).sort((a, b) => (a.s.z || 0) - (b.s.z || 0)).forEach(({ s, im }) => {
    const sw = s.w * k, sh = s.h * k, sx = FX + s.x * k, sy = FY + s.y * k, cx0 = sx + sw / 2, cy0 = sy + sh / 2;
    if (cx0 < 0 || cx0 > W || cy0 < SAFE_TOP - 60 || cy0 > SAFE_BOT + 60) return;
    g.save(); g.translate(cx0, cy0); g.rotate(((s.rotation || 0) * Math.PI) / 180); drawContain(g, im, -sw / 2, -sh / 2, sw, sh); g.restore();
  });

  /* ---- call to action under the frame (free promo: it names the app and shows the profile link) ---- */
  { // Deliberately quiet: the profile is the star. A glass pill in the theme's own surface colours, with only a thin accent edge.
    const l1 = 'Find me on fiiyou', url = displayUrl(slug), F1 = `700 32px ${nameStack}`, F2 = `500 23px ${bodyStack}`;
    g.font = F1; const w1 = g.measureText(l1).width; g.font = F2; const w2 = Math.min(g.measureText(url).width, FW - 140);
    const cw = clamp(Math.max(w1, w2) + 100, 480, FW), cx0 = Math.round((W - cw) / 2), cy0 = FY + frameH + CTA_GAP, cr = Math.min(CTA_H / 2, Math.max(r1, 12));
    panel(cx0, cy0, cw, CTA_H, cr, t.frame_color, Math.max(frameAlpha, 0.6)); outline(cx0, cy0, cw, CTA_H, cr, rgba(t.accent_color, 0.4), Math.min(lw || 2, 2));
    g.textAlign = 'center'; g.textBaseline = 'middle';                    // both lines centred as a pair inside the pill
    g.font = F1; g.fillStyle = rgba(t.text_color, 0.9); g.fillText(l1, W / 2, cy0 + CTA_H * 0.37);
    g.font = F2; g.fillStyle = rgba(t.text_color, 0.5); g.fillText(ellipsize(g, url, FW - 140), W / 2, cy0 + CTA_H * 0.71); }

  return out;
}

export const storyBlob = (c) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));

export async function shareStory(canvas, slug) {
  const blob = await storyBlob(canvas);
  const file = new File([blob], `fiiyou-${slug}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text: profileUrl(slug) }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
