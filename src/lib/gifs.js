/* GIF messages use the same trick as shared posts: a normal text message with a prefix.
   GifJif's default search is randomised; sort=top is what makes results match the query.
   The URL is deliberately restricted to the GIF provider, so a message can never turn into
   an arbitrary remote image or tracking pixel. */

export const GIF_PREFIX = 'fiiyou:gif:';
const MAX_SIDE = 2000;
const MIN_SIDE = 16;
const GIF_HOST = 'https://gifjif.com';

function mediaUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:') return null;
    if (u.hostname !== 'gifjif.com' && !u.hostname.endsWith('.gifjif.com')) return null;
    if (!/\.(webp|gif)$/i.test(u.pathname)) return null;
    return u.toString();
  } catch { return null; }
}

function mediaPath(value) {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:') return null;
    if (u.hostname !== 'gifjif.com' && !u.hostname.endsWith('.gifjif.com')) return null;
    if (!/^\/[A-Za-z0-9/_.-]+\.(webp|gif)$/i.test(u.pathname) || u.pathname.includes('..')) return null;
    return u.pathname;
  } catch { return null; }
}

const storedPath = (value) => (typeof value === 'string' && /^\/[A-Za-z0-9/_.-]+\.(webp|gif)$/i.test(value) && !value.includes('..') ? value : null);

const side = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= MIN_SIDE && n <= MAX_SIDE ? n : 240;
};

function normalize(item) {
  if (!item || typeof item !== 'object') return null;
  const media = item.media && typeof item.media === 'object' ? item.media : {};
  const src = mediaUrl(media.tinywebp) || mediaUrl(media.webp) || mediaUrl(media.tinygif) || mediaUrl(media.gif);
  if (!src) return null;
  return {
    id: String(item.id || src),
    url: src,
    width: side(item.width),
    height: side(item.height),
    title: String(item.title || 'GIF').slice(0, 120),
  };
}

/** Trending (empty q) or search results from GifJif's keyless, CORS-enabled API. */
export async function searchGifs(q, { signal, limit = 24 } = {}) {
  const text = String(q || '').trim().slice(0, 80);
  const url = text
    ? `https://gifjif.com/api/search?q=${encodeURIComponent(text)}&limit=${Math.min(30, Math.max(1, limit))}&sort=top`
    : `https://gifjif.com/api/feed?limit=${Math.min(30, Math.max(1, limit))}&sort=top`;
  const r = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`GIF search is unavailable (${r.status}).`);
  const data = await r.json();
  return (Array.isArray(data?.items) ? data.items : []).map(normalize).filter(Boolean);
}

/** Build a message/comment body: GIF_PREFIX + JSON + optional caption on the next line. */
export function encodeGif(gif, note = '', max = 1000) {
  const path = mediaPath(gif?.url); if (!path) throw new Error('That GIF is not allowed.');
  const base = { v: 1, u: path, w: side(gif.width), h: side(gif.height) };
  const caption = String(note || '').trim();
  for (let len = Math.min(caption.length, Math.max(0, max - 130)); ; len -= 10) {
    const body = GIF_PREFIX + JSON.stringify(base) + (len > 0 ? `\n${caption.slice(0, len)}` : '');
    if (body.length <= max || len <= 0) return body.slice(0, max);
  }
}

/** { gif, note } for a GIF message/comment, or null for ordinary text. */
export function decodeGif(body) {
  if (typeof body !== 'string' || !body.startsWith(GIF_PREFIX)) return null;
  const nl = body.indexOf('\n');
  try {
    const d = JSON.parse(nl < 0 ? body.slice(GIF_PREFIX.length) : body.slice(GIF_PREFIX.length, nl));
    const path = storedPath(d?.u);
    if (!path || d?.v !== 1) return null;
    return {
      gif: { url: `${GIF_HOST}${path}`, width: side(d.w), height: side(d.h), title: 'GIF' },
      note: nl < 0 ? '' : body.slice(nl + 1).trim(),
    };
  } catch { return null; }
}

export const isGif = (body) => decodeGif(body) !== null;
