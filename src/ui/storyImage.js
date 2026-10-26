import { toCanvas } from 'html-to-image';

/* 9:16 story: just the profile card, as large and sharp as it can be. No extra text. */
const W = 1080, H = 1920;
const SHARE_ORIGIN = 'https://app.fiiyou.online';

const MARGIN = 26;                         // min side margin of the card
const CARD_TOP = 240, CARD_BOTTOM = 1680;  // area the card may use (clear of Instagram's top/bottom UI)
const SHADOW = 0.1;                        // card shadow strength: 1 = as strong as the app's own, 0 = none
const BLEED = 96;                          // transparent room around the card so stickers hanging outside it survive
const WIDTHS = [460, 520, 580, 640, 700, 780, 860, 960]; // layout widths (css px) tried for the photo

/* Owner buttons that never belong in a shared picture. Also anything marked data-nostory. */
const NOISE = /customi[sz]e profile|edit profile|share as image|making image/i;
/* Extra clutter, only removed with { clean: true } */
const NOISE_CLEAN = /^\s*(send|delete|report|block|add friend|message)\s*$/i;

export const profileUrl = (slug) => `${SHARE_ORIGIN}/${encodeURIComponent(slug)}`;

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
const loadImg = (src) => new Promise((res) => {
  if (!src) return res(null);
  const i = new Image(); i.crossOrigin = 'anonymous';
  i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
});

/* ---------- colour helpers ---------- */
function parseRGB(c) {
  const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
  return [r, g, b].every(Number.isFinite) ? { r, g, b, a } : null;
}

function paintBackground(g, base) { g.fillStyle = base || '#0b0b0b'; g.fillRect(0, 0, W, H); }

/* scale the alpha of every colour in a CSS box-shadow value */
function scaleShadow(value, k) {
  if (!value || value === 'none') return 'none';
  let found = false;
  const out = value.replace(/rgba?\(([^)]+)\)/g, (_, inner) => {
    found = true;
    const [r, g, b, a = 1] = inner.split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return `rgba(${r}, ${g}, ${b}, ${(a * k).toFixed(4)})`;
  });
  return found ? out : 'none';
}

/* ---------- build the off-screen copy that gets photographed ---------- */
function makeCopy(frame, hide, clean) {
  const copy = frame.cloneNode(true);
  // <canvas> content is not copied by cloneNode
  const src = frame.querySelectorAll('canvas'), dst = copy.querySelectorAll('canvas');
  src.forEach((c, i) => { try { dst[i]?.getContext('2d')?.drawImage(c, 0, 0); } catch { /* tainted or webgl */ } });

  copy.querySelectorAll('audio, video, .grip, [data-nostory]').forEach((n) => n.remove());
  if (hide) copy.querySelectorAll(hide).forEach((n) => n.remove());
  copy.querySelectorAll('button, a').forEach((n) => { if (NOISE.test(n.textContent || '')) n.remove(); });
  if (clean) {
    copy.querySelectorAll('button, a').forEach((n) => { if (NOISE_CLEAN.test(n.textContent || '')) n.remove(); });
    copy.querySelectorAll('input:not([type=range]), textarea').forEach((n) => n.remove());
  }
  copy.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; });

  Object.assign(copy.style, {
    margin: '0', transform: 'none', position: 'relative', left: 'auto', top: 'auto',
    minWidth: '0', maxWidth: 'none', height: 'auto', minHeight: '0',
    boxShadow: scaleShadow(getComputedStyle(frame).boxShadow, SHADOW),
  });
  return copy;
}

/* The layout width that makes the card (and so its text) biggest inside the story area. */
function pickWidth(copy, areaW, areaH) {
  let best = null;
  for (const w of WIDTHS) {
    copy.style.width = `${w}px`;
    const r = copy.getBoundingClientRect();
    if (copy.scrollWidth > w + 2) continue;                       // content no longer fits: too narrow
    const s = Math.min(areaW / r.width, areaH / r.height);
    if (!best || s > best.s * 1.01) best = { w, s };
  }
  return best?.w ?? 680;
}

const isSafari = () => /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

/**
 * Renders the 1080x1920 story.
 *  frame        – the profile element
 *  page         – element whose background colour / --overlay style the story
 *  bgSrc        – optional background image URL
 *  username     – used for the link; pass `slug` if the public URL differs
 *  hide         – optional extra CSS selector of things to leave out of the photo
 *  clean        – true also hides the guestbook box, Send/Delete buttons etc. (default false)
 *  captureWidth – 'auto' (default: picks the layout width that gives the biggest text) or a number of css px
 */
export async function renderStory({ frame, page, bgSrc, username, slug = username, hide, captureWidth = 'auto', clean = false }) {
  try { await document.fonts.ready; } catch { /* ignore */ }

  const areaW = W - MARGIN * 2, areaH = CARD_BOTTOM - CARD_TOP;

  /* 1. Photograph an off-screen copy of the profile */
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:absolute;left:-10000px;top:0;padding:${BLEED}px;pointer-events:none;`;
  const copy = makeCopy(frame, hide, clean);
  wrap.appendChild(copy);
  frame.parentNode.insertBefore(wrap, frame.nextSibling);

  let shot, fw, fh, s;
  try {
    copy.style.width = `${typeof captureWidth === 'number' ? captureWidth : 680}px`;
    await nextFrame();
    await withTimeout(Promise.all([...copy.querySelectorAll('img')].map((i) => i.decode?.().catch(() => {}))), 3000);
    if (captureWidth === 'auto') copy.style.width = `${pickWidth(copy, areaW, areaH)}px`;
    await nextFrame();

    const r = copy.getBoundingClientRect(); fw = r.width; fh = r.height;
    s = Math.min(areaW / fw, areaH / fh);                                       // css px -> story px
    const opts = {
      pixelRatio: Math.min(4, Math.max(2, s * 1.5)),                            // always sharper than the size it is drawn at
      cacheBust: false,
      style: { position: 'static', left: '0', top: '0', margin: '0' },
    };
    if (isSafari()) await toCanvas(wrap, opts);                                 // Safari drops images on the first pass
    shot = await toCanvas(wrap, opts);
  } finally { wrap.remove(); }

  /* 2. Canvas + background */
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d'); g.imageSmoothingQuality = 'high';
  const cs = getComputedStyle(page);
  let base = cs.backgroundColor;
  if (!parseRGB(base) || parseRGB(base).a === 0) base = getComputedStyle(document.body).backgroundColor;
  if (!parseRGB(base) || parseRGB(base).a === 0) base = '#0b0b0b';
  paintBackground(g, base);

  const bg = await loadImg(bgSrc);
  if (bg) {
    const k = Math.max(W / bg.width, H / bg.height);
    g.drawImage(bg, (W - bg.width * k) / 2, (H - bg.height * k) / 2, bg.width * k, bg.height * k);
    const ov = parseFloat(cs.getPropertyValue('--overlay'));
    g.fillStyle = `rgba(0,0,0,${Number.isFinite(ov) ? ov : 0.4})`; g.fillRect(0, 0, W, H);
  }

  /* 3. Card, centred. The shadow is light and drawn only outside the card, so it never dirties the glass. */
  const cy = (CARD_TOP + CARD_BOTTOM) / 2;
  const dw = (fw + BLEED * 2) * s, dh = (fh + BLEED * 2) * s;
  const dx = (W - dw) / 2, dy = cy - dh / 2;

  const sh = document.createElement('canvas'); sh.width = W; sh.height = H;
  const sg = sh.getContext('2d');
  sg.shadowColor = `rgba(0,0,0,${0.13 * SHADOW})`; sg.shadowBlur = 30; sg.shadowOffsetY = 8;
  sg.drawImage(shot, dx, dy, dw, dh);
  sg.shadowColor = 'transparent';
  sg.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 3; i++) sg.drawImage(shot, dx, dy, dw, dh);   // knock the card's own area out of the shadow
  g.drawImage(sh, 0, 0);
  g.drawImage(shot, dx, dy, dw, dh);

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

export { SHARE_ORIGIN };
