import { toCanvas } from 'html-to-image';

/* 9:16 story: big wordmark, the profile card large and sharp, clean link underneath. */
const W = 1080, H = 1920;
const SHARE_ORIGIN = 'https://app.fiiyou.online';
const FONT = '"Ubuntu Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const MARGIN = 26;                        // min side margin of the card
const WORDMARK_Y = 270;                   // vertical centre of "fiiyou"
const URL_Y = H - 160;                    // vertical centre of the link
const CARD_TOP = 400, CARD_BOTTOM = 1520; // area the card may use
const CAPTURE_WIDTH = 680;                // css px the profile is laid out at for the photo (narrower = bigger text)
const BLEED = 56;                         // transparent room around the card so stickers that hang outside it survive

/* Owner-only controls that should never appear in a shared image (also anything with data-nostory) */
const NOISE = /customi[sz]e profile|edit profile|share as image|making image/i;

export const profileUrl = (slug) => `${SHARE_ORIGIN}/${encodeURIComponent(slug)}`;
const displayUrl = (slug) => `${SHARE_ORIGIN.replace('https://', '')}/${slug}`;

const loadImg = (src) => new Promise((res) => {
  if (!src) return res(null);
  const i = new Image(); i.crossOrigin = 'anonymous';
  i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
});
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

const fitSize = (g, t, wt, sz, maxW) => { for (; sz > 20; sz -= 2) { g.font = `${wt} ${sz}px ${FONT}`; if (g.measureText(t).width <= maxW) break; } return sz; };
function label(g, str, cx, cy, wt, sz, maxW) {
  fitSize(g, str, wt, sz, maxW);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,.14)'; g.shadowBlur = 14; g.shadowOffsetY = 3;
  g.fillText(str, cx, cy);
  g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
}

/**
 * Renders the 1080x1920 story.
 *  frame    – the profile element
 *  page     – element whose background colour / --overlay style the story
 *  bgSrc    – optional background image URL
 *  username – used for the link; pass `slug` if the public URL differs
 *  hide     – optional extra CSS selector of things to leave out of the photo
 */
export async function renderStory({ frame, page, bgSrc, username, slug = username, hide, captureWidth = CAPTURE_WIDTH }) {
  try {
    await Promise.all([document.fonts.load(`800 190px ${FONT}`), document.fonts.load(`300 72px ${FONT}`)]);
    await document.fonts.ready;
  } catch { /* system font fallback */ }

  /* 1. Photograph an off-screen copy of the profile.
        Working on a copy means: no blank margin / clipped edge from the live layout,
        a narrower width so text comes out larger, and no "Making image…" button state. */
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:absolute;left:-10000px;top:0;padding:${BLEED}px;pointer-events:none;`;
  const copy = frame.cloneNode(true);
  copy.querySelectorAll('audio, video, .grip, [data-nostory]').forEach((n) => n.remove());
  if (hide) copy.querySelectorAll(hide).forEach((n) => n.remove());
  copy.querySelectorAll('button, a').forEach((n) => { if (NOISE.test(n.textContent || '')) n.remove(); });
  Object.assign(copy.style, {
    margin: '0', transform: 'none', position: 'relative', left: 'auto', top: 'auto',
    minWidth: '0', maxWidth: 'none', width: `${captureWidth || frame.getBoundingClientRect().width}px`,
  });
  wrap.appendChild(copy);
  frame.parentNode.insertBefore(wrap, frame.nextSibling);

  let shot, fw, fh, s;
  try {
    await nextFrame();
    const r = copy.getBoundingClientRect(); fw = r.width; fh = r.height;
    s = Math.min((W - MARGIN * 2) / fw, (CARD_BOTTOM - CARD_TOP) / fh);        // css px -> story px
    shot = await toCanvas(wrap, {
      pixelRatio: Math.min(4, Math.max(2, s * 1.5)),                           // always sharper than the size it is drawn at
      cacheBust: false,
      style: { position: 'static', left: '0', top: '0', margin: '0' },
    });
  } finally { wrap.remove(); }

  /* 2. Canvas + background */
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d'); g.imageSmoothingQuality = 'high';
  const cs = getComputedStyle(page);
  g.fillStyle = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : '#080808';
  g.fillRect(0, 0, W, H);
  const bg = await loadImg(bgSrc);
  if (bg) {
    const k = Math.max(W / bg.width, H / bg.height);
    g.drawImage(bg, (W - bg.width * k) / 2, (H - bg.height * k) / 2, bg.width * k, bg.height * k);
    const ov = parseFloat(cs.getPropertyValue('--overlay'));
    g.fillStyle = `rgba(0,0,0,${Number.isFinite(ov) ? ov : 0.4})`; g.fillRect(0, 0, W, H);
  }

  /* 3. Card, centred in its area (the bleed margin is transparent, so the card itself is exactly fw*s wide) */
  const dw = (fw + BLEED * 2) * s, dh = (fh + BLEED * 2) * s;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.24)'; g.shadowBlur = 40; g.shadowOffsetY = 14;
  g.drawImage(shot, (W - dw) / 2, (CARD_TOP + CARD_BOTTOM) / 2 - dh / 2, dw, dh);
  g.restore();

  /* 4. Wordmark + link */
  label(g, 'fiiyou', W / 2, WORDMARK_Y, 800, 190, W - 200);
  label(g, displayUrl(slug), W / 2, URL_Y, 300, 72, W - 120);
  return out;
}

export const storyBlob = (c) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));

/** Native share sheet with the image, else download. Returns 'shared' | 'cancelled' | 'downloaded'. Call from a tap. */
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

export { SHARE_ORIGIN };
