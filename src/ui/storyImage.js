import { FONT_STACKS, THEME_DEFAULTS } from './theme.js';

/* 9:16 story, drawn directly on a canvas (no screenshot of the page), so it is always crisp and never contains
   buttons, inputs or other things that only make sense on a live page. One calm card on the person's own colours:
   avatar, name, handle, mood, the song they listen to, a few interests, and a small link at the bottom. */
const W = 1080, H = 1920;
export const SHARE_ORIGIN = 'https://app.fiiyou.online';
export const profileUrl = (slug) => `${SHARE_ORIGIN}/${encodeURIComponent(slug)}`;

const VERIFIED_BLUE = '#1d9bf0';
const AREA_TOP = 230, AREA_BOTTOM = 1500;   // keeps clear of Instagram's top bar and reply bar
const CARD_X = 90, CARD_W = W - CARD_X * 2, PAD = 64, INNER = CARD_W - PAD * 2;

const loadImg = (src) => new Promise((res) => {
  if (!src) return res(null);
  const i = new Image(); i.crossOrigin = 'anonymous';
  i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
});

const rgbOf = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); const n = m ? parseInt(m[1], 16) : 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a) => { const [r, g, b] = rgbOf(h); return `rgba(${r},${g},${b},${a})`; };
const lum = (h) => { const f = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = rgbOf(h); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };

function rr(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/* cover-fit an image into a box */
function drawCover(g, img, x, y, w, h) {
  const k = Math.max(w / img.width, h / img.height), dw = img.width * k, dh = img.height * k;
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/* soft blur that works in every browser: shrink, then stretch back with smoothing */
function blurred(img, strength = 28) {
  const c = document.createElement('canvas'); c.width = Math.round(W / strength); c.height = Math.round(H / strength);
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; drawCover(g, img, 0, 0, c.width, c.height);
  return c;
}

function wrapLines(g, str, maxW, maxLines) {
  const words = String(str || '').split(/\s+/).filter(Boolean); const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width <= maxW) cur = t; else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; let l = lines[maxLines - 1]; while (l && g.measureText(`${l}…`).width > maxW) l = l.slice(0, -1); lines[maxLines - 1] = `${l.trimEnd()}…`; }
  return lines;
}

function fit(g, str, weight, size, maxW, family, min = 40) {
  let px = size; for (; px > min; px -= 2) { g.font = `${weight} ${px}px ${family}`; if (g.measureText(str).width <= maxW) break; }
  g.font = `${weight} ${px}px ${family}`; return px;
}

function checkBadge(g, cx, cy, r) {
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = VERIFIED_BLUE; g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = r * 0.2; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(cx - r * 0.42, cy + r * 0.04); g.lineTo(cx - r * 0.1, cy + r * 0.36); g.lineTo(cx + r * 0.46, cy - r * 0.3); g.stroke();
}

/**
 * Renders the 1080x1920 story.
 *  profile  – { username, display_name, headline, locality, verified, friends }
 *  theme    – the profile theme (colours, radius, fonts)
 *  avatarSrc / bgSrc – signed image URLs (optional)
 *  music    – { title, artist, coverSrc } (optional)
 *  interests – array of short strings (optional)
 */
export async function renderStory({ profile, theme, avatarSrc, bgSrc, music, interests = [], slug = profile.username }) {
  const t = { ...THEME_DEFAULTS, ...(theme || {}) };
  const nameStack = FONT_STACKS[t.name_font] || FONT_STACKS.ubuntu; const bodyStack = FONT_STACKS[t.font] || FONT_STACKS.ubuntu;
  try { await document.fonts.ready; await Promise.all([document.fonts.load(`800 80px ${nameStack}`), document.fonts.load(`600 36px ${bodyStack}`)]); } catch { /* system fallback */ }
  const [avatar, bg, cover] = await Promise.all([loadImg(avatarSrc), loadImg(bgSrc), loadImg(music?.coverSrc)]);

  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d'); g.imageSmoothingQuality = 'high';

  /* ---- background: their image, or their avatar softly blurred, under a calm wash of their page colour ---- */
  g.fillStyle = t.bg_color; g.fillRect(0, 0, W, H);
  const base = bg || avatar;
  if (base) { g.drawImage(blurred(base, bg ? 16 : 30), 0, 0, W, H); g.fillStyle = rgba(t.bg_color, bg ? 0.55 : 0.78); g.fillRect(0, 0, W, H); }

  const ink = t.text_color, soft = rgba(t.text_color, 0.66);
  const radius = Math.min(60, +t.radius * 2 + (+t.radius ? 6 : 0));

  /* ---- layout pass (draw=false) measures, paint pass draws; shrinks the avatar until everything fits ---- */
  const tags = (interests || []).filter(Boolean).slice(0, 8);
  const sub = [`@${profile.username}`, profile.locality].filter(Boolean).join(' · ');
  const hasMusic = !!(music && (music.title || music.artist));

  const lay = (draw, top, A) => {
    let y = top + PAD; const cx = W / 2;
    // avatar
    const ax = cx - A / 2, ar = Math.min(A / 2, radius * 1.4 + 10);
    if (draw) {
      g.save(); rr(g, ax, y, A, A, ar); g.clip();
      if (avatar) drawCover(g, avatar, ax, y, A, A); else { g.fillStyle = rgba(t.accent_color, 0.25); g.fillRect(ax, y, A, A); g.fillStyle = ink; g.font = `800 ${A * 0.4}px ${nameStack}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((profile.display_name || profile.username || '?').charAt(0).toUpperCase(), cx, y + A / 2); g.textBaseline = 'alphabetic'; }
      g.restore();
      rr(g, ax, y, A, A, ar); g.strokeStyle = t.accent_color; g.lineWidth = 6; g.stroke();
    }
    y += A + 52;
    // name (+ verified badge)
    const nm = t.name_case === 'upper' ? (profile.display_name || profile.username).toUpperCase() : (profile.display_name || profile.username);
    const badge = profile.verified ? 70 : 0;
    const px = fit(g, nm, 800, 88, INNER - badge, nameStack);
    const nw = g.measureText(nm).width, total = nw + (badge ? badge - 6 : 0), nx = cx - total / 2;
    if (draw) { g.fillStyle = ink; g.textAlign = 'left'; g.fillText(nm, nx, y + px * 0.8); if (badge) checkBadge(g, nx + nw + 6 + 31, y + px * 0.8 - px * 0.3, 31); }
    y += px + 12;
    // @handle · place
    g.font = `600 38px ${bodyStack}`;
    if (draw) { g.fillStyle = soft; g.textAlign = 'center'; g.fillText(sub, cx, y + 34, INNER); }
    y += 52;
    // mood / headline
    if (profile.headline) {
      g.font = `500 42px ${bodyStack}`; const ls = wrapLines(g, profile.headline, INNER - 40, 2);
      y += 18;
      if (draw) { g.fillStyle = rgba(t.text_color, 0.88); g.textAlign = 'center'; ls.forEach((l, i) => g.fillText(l, cx, y + 40 + i * 56)); }
      y += ls.length * 56 + 8;
    }
    // now playing
    if (hasMusic) {
      y += 40; const ch = 132;
      if (draw) {
        rr(g, PAD + CARD_X, y, INNER, ch, Math.max(10, radius * 0.5)); g.fillStyle = rgba(t.text_color, 0.07); g.fill();
        let tx = PAD + CARD_X + 28;
        if (cover) { g.save(); rr(g, tx, y + 16, 100, 100, Math.max(6, radius * 0.3)); g.clip(); drawCover(g, cover, tx, y + 16, 100, 100); g.restore(); tx += 100 + 26; }
        const room = PAD + CARD_X + INNER - 28 - tx; g.textAlign = 'left';
        g.font = `700 24px ${bodyStack}`; g.fillStyle = rgba(t.text_color, 0.5); g.fillText('NOW PLAYING', tx, y + 44);
        fit(g, music.title || 'Untitled', 750, 38, room, bodyStack, 26); g.fillStyle = ink; g.fillText(music.title || 'Untitled', tx, y + 84);
        if (music.artist) { fit(g, music.artist, 550, 30, room, bodyStack, 22); g.fillStyle = soft; g.fillText(music.artist, tx, y + 118); }
      }
      y += ch;
    }
    // interests
    if (tags.length) {
      y += 40; const ch = 64, gap = 14; g.font = `600 32px ${bodyStack}`;
      const rows = []; let row = [], rw = 0;
      for (const tag of tags) { const w = g.measureText(tag).width + 56; if (row.length && rw + gap + w > INNER) { rows.push(row); row = []; rw = 0; } row.push({ tag, w }); rw += (rw ? gap : 0) + w; }
      if (row.length) rows.push(row);
      const shown = rows.slice(0, 3);
      shown.forEach((r, ri) => {
        const rowW = r.reduce((a, c) => a + c.w, 0) + gap * (r.length - 1); let x = cx - rowW / 2; const ry = y + ri * (ch + gap);
        if (draw) r.forEach((c) => { rr(g, x, ry, c.w, ch, Math.min(radius, ch / 2)); g.strokeStyle = rgba(t.text_color, 0.28); g.lineWidth = 2; g.stroke(); g.fillStyle = ink; g.textAlign = 'center'; g.fillText(c.tag, x + c.w / 2, ry + 43); x += c.w + gap; });
      });
      y += shown.length * ch + (shown.length - 1) * gap;
    }
    return y + PAD - top;   // card height
  };

  let A = 400, cardH = lay(false, 0, A);
  while (cardH > AREA_BOTTOM - AREA_TOP && A > 240) { A -= 20; cardH = lay(false, 0, A); }
  const top = AREA_TOP + (AREA_BOTTOM - AREA_TOP - cardH) / 2;

  /* ---- card ---- */
  g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 60; g.shadowOffsetY = 20;
  rr(g, CARD_X, top, CARD_W, cardH, radius); g.fillStyle = rgba(t.card_color, base ? 0.92 : 1); g.fill(); g.restore();
  rr(g, CARD_X, top, CARD_W, cardH, radius); g.strokeStyle = t.border_color; g.lineWidth = Math.max(2, +t.border_width * 2); g.stroke();
  lay(true, top, A);

  /* ---- footer: small, plain, no pill ---- */
  g.textAlign = 'center'; g.fillStyle = ink; g.font = `800 54px ${nameStack}`; g.fillText('fiiyou', W / 2, 1596);
  g.fillStyle = soft; g.font = `600 34px ${bodyStack}`; g.fillText(`${SHARE_ORIGIN.replace(/^https?:\/\//, '')}/${slug}`, W / 2, 1650);
  void lum;
  return out;
}

export const storyBlob = (c) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));

/** Native share sheet with the image, else download. Returns 'shared' | 'cancelled' | 'downloaded'. Call from a tap. */
export async function shareStory(canvas, slug) {
  const blob = await storyBlob(canvas);
  const file = new File([blob], `fiiyou-${slug}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
