import { supabase, unwrap } from '../lib/client.js';
import { draftMediaPaths } from '../lib/draftStore.js';

const BUCKET = 'media';
const MAX_BYTES = 1_500_000;        // keep under bucket limit (1572864)

// Per-use targets: longest side (px) and max size (KB). WebP, EXIF stripped, re-encoded until it fits.
// Stickers are small on screen (about 15% of the cards column, so roughly 140 CSS px wide before the owner resizes them), which is why they get the tightest
// budget of all: 420 px on the long side and ~45 KB. Transparency is kept (WebP has an alpha channel).
export const PRESETS = { avatar: { max: 512, kb: 70 }, sticker: { max: 420, kb: 45 }, cover: { max: 640, kb: 80 },
  photo: { max: 1280, kb: 200 }, post: { max: 1280, kb: 200 }, event: { max: 1280, kb: 240 }, bg: { max: 1600, kb: 260 } };

// Animated GIFs are kept as they are (nothing in the browser can re-encode an animation), so they must already be small. Stickers get a lower cap.
const GIF_MAX = { sticker: 300_000, default: 600_000 };
const QUALITY = [0.82, 0.7, 0.58, 0.46, 0.36];           // tried in this order at each size
const HARD_MAX = { sticker: 120_000, default: 300_000 }; // last resort: anything still bigger than this after every shrink round is refused

/** Resizes + re-encodes. Returns { blob, width, height } (the stored picture's real size, which stickers need for their aspect ratio). */
async function encodeImage(file, preset = 'photo') {
  const { max, kb } = PRESETS[preset] ?? PRESETS.photo;
  const isSticker = preset === 'sticker';
  if (file.type === 'image/gif') {                       // keep animation; must already be small
    const cap = isSticker ? GIF_MAX.sticker : GIF_MAX.default;
    if (file.size > cap) throw new Error(`GIF is over ${Math.round(cap / 1000)} KB. Use a smaller GIF or a still image.`);
    const g = await createImageBitmap(file); const w = g.width, h = g.height; g.close?.();
    if (preset === 'avatar' && Math.abs(w - h) > 1)      // a GIF cannot be cropped here without losing the animation, so it must already be square
      throw new Error('Animated avatars must be square (same width and height). Crop the GIF, or use a still image.');
    return { blob: file, width: w, height: h };
  }
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    // Avatars are stored SQUARE. Everything that shows one (circles, the 5:6 profile frame, chat bubbles, notifications) then looks right
    // without guessing. Landscape: centred. Portrait: the square starts 30% from the top, because faces sit in the upper part of a photo.
    let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
    if (preset === 'avatar') { const s = Math.min(bmp.width, bmp.height); sx = (bmp.width - s) / 2; sy = bmp.height > bmp.width ? (bmp.height - s) * 0.3 : 0; sw = sh = s; }
    let scale = Math.min(1, max / Math.max(sw, sh)), blob = null, cw = 1, ch = 1;
    for (let round = 0; round < 7; round++) {
      cw = Math.max(1, Math.round(sw * scale)); ch = Math.max(1, Math.round(sh * scale));
      const c = new OffscreenCanvas(cw, ch); const g = c.getContext('2d');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(bmp, sx, sy, sw, sh, 0, 0, cw, ch);
      for (const q of QUALITY) {
        const b = await c.convertToBlob({ type: 'image/webp', quality: q });
        if (b.type !== 'image/webp') { blob = b; break; }  // this browser cannot write WebP (it silently returns PNG): shrink the picture instead of trusting quality
        blob = b; if (b.size <= kb * 1024) return { blob: b, width: cw, height: ch };
      }
      scale *= isSticker ? 0.8 : 0.85;                   // still too big: shrink and retry
    }
    const hard = isSticker ? HARD_MAX.sticker : HARD_MAX.default;
    if (!blob || blob.size > hard) throw new Error(isSticker ? 'That sticker is too detailed to shrink. Try a simpler or smaller picture.' : 'Image is too large.');   // was 1.4 MB: a photo that could not be squeezed still went up at up to 1.4 MB
    return { blob, width: cw, height: ch };
  } finally { bmp.close?.(); }
}

export async function compressImage(file, preset = 'photo') { return (await encodeImage(file, preset)).blob; }

async function myId() {
  // getSession() reads the local session; getUser() calls the server and can drop the local session on a server-side error.
  const { data } = await supabase.auth.getSession();
  if (!data?.session?.user) throw new Error('not_authenticated');
  return data.session.user.id;
}

async function store(blob) {
  const ext = { 'image/gif': 'gif', 'image/png': 'png', 'image/jpeg': 'jpg' }[blob.type] || 'webp';   // normally webp; the others only when a browser cannot write WebP
  const path = `${await myId()}/${crypto.randomUUID()}.${ext}`;
  unwrap(await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type, cacheControl: '31536000', upsert: false,
  }));
  return path;
}

/** Uploads and returns the storage path (store THIS in avatar_path / card content / posts). */
export async function uploadImage(file, preset = 'photo') { return store(await compressImage(file, preset)); }

/** Stickers: compressed hard (see PRESETS.sticker), then uploaded. Returns { path, width, height } of the stored picture, so the caller can size the sticker
 *  from what is really stored (the original may be rotated by EXIF or far bigger). */
export async function uploadSticker(file) {
  const { blob, width, height } = await encodeImage(file, 'sticker');
  return { path: await store(blob), width, height };
}

export async function deleteImage(path) {
  unwrap(await supabase.storage.from(BUCKET).remove([path]));
}

// ---- signed URL cache (buckets are private) ----
// EGRESS: the browser only reuses a downloaded picture when the URL is IDENTICAL, token included. This cache used to live in memory with 1 h links, so every
// reload (and every hour) signed brand-new URLs and every avatar, photo, font and song was downloaded again, although uploads are sent with a 1 year
// cache header. Now the links are kept in localStorage and reused until they expire (24 h), so a picture is downloaded once per device per day instead of
// once per visit. They are wiped on sign-out. A path that is already being signed is not asked for twice, a failed request is retried once quietly,
// a failure is never cached, and a path that could not be signed comes back as null.
const TTL = 86400, SAFETY = 900, STORE = 'fiiyou.signed.v1', MAX_KEPT = 600, cache = new Map(), flying = new Map();
try {   // load what an earlier visit already signed (links that are about to expire are left out)
  const saved = JSON.parse(localStorage.getItem(STORE) || '{}'); const now = Date.now();
  for (const [k, v] of Object.entries(saved)) if (v && typeof v.url === 'string' && v.exp > now) cache.set(k, v);
} catch { /* private mode or storage blocked: the cache just lives in memory */ }
let saveT = 0;
const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => { try {
  const now = Date.now(); const rows = [...cache.entries()].filter(([, v]) => v.exp > now).sort((x, y) => y[1].exp - x[1].exp).slice(0, MAX_KEPT);
  localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(rows)));
} catch { /* storage full or blocked */ } }, 400); };
export function clearSignedCache() { cache.clear(); clearTimeout(saveT); try { localStorage.removeItem(STORE); } catch { /* ignore */ } }
try { supabase.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') clearSignedCache(); }); } catch { /* auth not ready: nothing to wipe */ }

async function sign(bucket, paths) {
  const call = async () => unwrap(await supabase.storage.from(bucket).createSignedUrls(paths, TTL));
  let rows; try { rows = await call(); } catch { await new Promise((r) => setTimeout(r, 700)); rows = await call(); }
  const exp = Date.now() + (TTL - SAFETY) * 1000;
  for (const r of rows) if (r.signedUrl && r.path) cache.set(`${bucket}/${r.path}`, { url: r.signedUrl, exp });
  persist();
}

export async function signedUrls(paths, bucket = BUCKET) {
  const key = (p) => `${bucket}/${p}`; const want = [...new Set(paths.filter(Boolean))];
  const need = want.filter((p) => !(cache.get(key(p))?.exp > Date.now()) && !flying.has(key(p)));
  if (need.length) { const job = sign(bucket, need).finally(() => need.forEach((p) => flying.delete(key(p)))); need.forEach((p) => flying.set(key(p), job)); }
  await Promise.allSettled([...new Set(want.map((p) => flying.get(key(p))).filter(Boolean))]);
  return Object.fromEntries(paths.filter(Boolean).map((p) => [p, cache.get(key(p))?.url ?? null]));
}
export async function signedUrl(path, bucket = BUCKET) { return path ? (await signedUrls([path], bucket))[path] : null; }

// ---- custom fonts: private 'fonts' bucket, one file per profile theme (theme.font_file) ----
const MAX_FONT = 300 * 1024;                              // keep equal to the bucket's file_size_limit (307200)
const tag = (u8) => String.fromCharCode(...u8);
const FONT_MAGIC = { wOF2: ['woff2', 'font/woff2'], wOFF: ['woff', 'font/woff'], OTTO: ['otf', 'font/otf'],
  true: ['ttf', 'font/ttf'], '\0\x01\0\0': ['ttf', 'font/ttf'] };

/** Font files only (woff2 / woff / otf / ttf), max 300 KB. Returns the storage path for theme.font_file.
 *  Browsers report fonts as application/octet-stream or '', so the type is detected from the file's first 4 bytes,
 *  then the browser itself parses the file once to reject anything broken. */
export async function uploadFont(file) {
  if (file.size > MAX_FONT) throw new Error('Font file is over 300 KB. Use a .woff2 file (usually 20-60 KB).');
  const buf = await file.arrayBuffer();
  const [ext, type] = FONT_MAGIC[tag(new Uint8Array(buf, 0, 4))] || [];
  if (!ext) throw new Error('Unsupported font. Use a .woff2, .woff, .otf or .ttf file.');
  try { await new FontFace('uf-check', buf).load(); } catch { throw new Error('That font file could not be read. It may be damaged.'); }
  const path = `${await myId()}/${crypto.randomUUID()}.${ext}`;
  unwrap(await supabase.storage.from('fonts').upload(path, new Blob([buf], { type }), { contentType: type, upsert: false }));
  return path;
}
export async function deleteFont(path) { unwrap(await supabase.storage.from('fonts').remove([path])); }

export async function removeAllMyImages() {
  const id = await myId();
  for (const b of [BUCKET, 'audio', 'fonts']) {   // 'audio' no longer receives uploads; it is still emptied so any old file is deleted too
    const files = unwrap(await supabase.storage.from(b).list(id, { limit: 1000 }));
    if (files.length) unwrap(await supabase.storage.from(b).remove(files.map((f) => `${id}/${f.name}`)));
  }
}

/** Safety net: removes my files that nothing references any more (older than `graceMs`, so drafts are safe).
 *  Deleting through the Storage API is the only way to really free space; SQL deletes would orphan files. */
export async function sweepOrphans(graceMs = 2 * 3600e3) {
  const id = await myId();
  const [prof, cards, photos, posts, scheduled] = await Promise.all([
    supabase.from('profiles').select('avatar_path, theme, music').eq('id', id).single(),
    supabase.from('profile_cards').select('content').eq('profile_id', id),
    supabase.from('photos').select('path').eq('owner_id', id),
    supabase.from('posts').select('image_path, extra_images').eq('author_id', id),
    supabase.from('scheduled_posts').select('image_path, extra_images').eq('author_id', id),   // photos of posts that are waiting for their time
  ].map((p) => p.then(unwrap)));
  // Everything a row can point to must be listed here (same list as admin_referenced_paths() in the database):
  // a path that is missing from this set is deleted from storage as an "orphan". Extra post photos used to be missing, so they vanished.
  const media = new Set([prof.avatar_path, prof.theme?.bg_image, prof.music?.cover, ...cards.flatMap((c) => c.content?.images || []),
    ...photos.map((p) => p.path), ...posts.flatMap((p) => [p.image_path, ...(p.extra_images || [])]),
    ...(scheduled || []).flatMap((p) => [p.image_path, ...(p.extra_images || [])])].filter(Boolean));
  const audio = new Set();                              // audio uploads were removed: anything left in the old 'audio' bucket is an orphan and is swept away
  const fonts = new Set([prof.theme?.font_file].filter(Boolean));
  for (const keep of [media, fonts]) for (const p of draftMediaPaths(id)) keep.add(p);   // files of an autosaved, unsaved editor draft are still wanted
  let removed = 0;
  for (const [bucket, keep] of [[BUCKET, media], ['audio', audio], ['fonts', fonts]]) {
    const files = unwrap(await supabase.storage.from(bucket).list(id, { limit: 1000 }));
    const dead = files.filter((f) => f.name !== '.emptyFolderPlaceholder' && f.created_at && Date.now() - new Date(f.created_at) > graceMs && !keep.has(`${id}/${f.name}`)).map((f) => `${id}/${f.name}`);
    if (dead.length) { unwrap(await supabase.storage.from(bucket).remove(dead)); removed += dead.length; }
  }
  return removed;
}
