import { supabase, unwrap } from '../lib/client.js';

const BUCKET = 'media';
const MAX_BYTES = 1_500_000;        // keep under bucket limit (1572864)

// Per-use targets: longest side (px) and max size (KB). WebP, EXIF stripped, re-encoded until it fits.
export const PRESETS = { avatar: { max: 512, kb: 70 }, sticker: { max: 480, kb: 60 }, cover: { max: 640, kb: 80 },
  photo: { max: 1280, kb: 200 }, post: { max: 1280, kb: 200 }, event: { max: 1280, kb: 240 }, bg: { max: 1600, kb: 260 } };

export async function compressImage(file, preset = 'photo') {
  const { max, kb } = PRESETS[preset] ?? PRESETS.photo;
  if (file.type === 'image/gif') {                       // keep animation; must already be small
    if (file.size > 600_000) throw new Error('GIF is over 600 KB. Use a smaller GIF or a still image.');
    return file;
  }
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  let scale = Math.min(1, max / Math.max(bmp.width, bmp.height)), blob;
  for (let round = 0; round < 6; round++) {
    const c = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * scale)), Math.max(1, Math.round(bmp.height * scale)));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    for (let q = 0.82; q >= 0.4; q -= 0.14) { blob = await c.convertToBlob({ type: 'image/webp', quality: q }); if (blob.size <= kb * 1024) return blob; }
    scale *= 0.85;                                       // still too big: shrink and retry
  }
  if (blob.size > 1_400_000) throw new Error('Image is too large.');
  return blob;
}

async function myId() {
  const { data } = await supabase.auth.getUser();
  if (!data?.user) throw new Error('not_authenticated');
  return data.user.id;
}

/** Uploads and returns the storage path (store THIS in avatar_path / card content / posts). */
export async function uploadImage(file, preset = 'photo') {
  const blob = await compressImage(file, preset);
  const ext = blob.type === 'image/gif' ? 'gif' : 'webp';
  const path = `${await myId()}/${crypto.randomUUID()}.${ext}`;
  unwrap(await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type, cacheControl: '31536000', upsert: false,
  }));
  return path;
}

export async function deleteImage(path) {
  unwrap(await supabase.storage.from(BUCKET).remove([path]));
}

// ---- signed URL cache (buckets are private; URLs live 1h, refreshed at 50 min) ----
const TTL = 3600, cache = new Map();

export async function signedUrls(paths, bucket = BUCKET) {
  const now = Date.now(), key = (p) => `${bucket}/${p}`;
  const need = [...new Set(paths.filter(Boolean))].filter((p) => !(cache.get(key(p))?.exp > now));
  if (need.length) {
    const rows = unwrap(await supabase.storage.from(bucket).createSignedUrls(need, TTL));
    for (const r of rows) if (r.signedUrl) cache.set(key(r.path), { url: r.signedUrl, exp: now + (TTL - 600) * 1000 });
  }
  return Object.fromEntries(paths.filter(Boolean).map((p) => [p, cache.get(key(p))?.url ?? null]));
}
export async function signedUrl(path, bucket = BUCKET) { return path ? (await signedUrls([path], bucket))[path] : null; }

const AUDIO_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/webm'];
/** Audio-only music, max 8 MB. Returns the storage path for profile.music.audio. */
export async function uploadAudio(file) {
  if (!AUDIO_TYPES.includes(file.type)) throw new Error('Unsupported audio format (use mp3, m4a, ogg or wav).');
  if (file.size > 8 * 1024 * 1024) throw new Error('Audio file is over 8 MB.');
  const ext = (file.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp3';
  const path = `${await myId()}/${crypto.randomUUID()}.${ext}`;
  unwrap(await supabase.storage.from('audio').upload(path, file, { contentType: file.type, upsert: false }));
  return path;
}
export async function deleteAudio(path) { unwrap(await supabase.storage.from('audio').remove([path])); }

export async function removeAllMyImages() {
  const id = await myId();
  for (const b of [BUCKET, 'audio']) {
    const files = unwrap(await supabase.storage.from(b).list(id, { limit: 1000 }));
    if (files.length) unwrap(await supabase.storage.from(b).remove(files.map((f) => `${id}/${f.name}`)));
  }
}

/** Safety net: removes my files that nothing references any more (older than `graceMs`, so drafts are safe).
 *  Deleting through the Storage API is the only way to really free space; SQL deletes would orphan files. */
export async function sweepOrphans(graceMs = 2 * 3600e3) {
  const id = await myId();
  const [prof, cards, photos, posts] = await Promise.all([
    supabase.from('profiles').select('avatar_path, theme, music').eq('id', id).single(),
    supabase.from('profile_cards').select('content').eq('profile_id', id),
    supabase.from('photos').select('path').eq('owner_id', id),
    supabase.from('posts').select('image_path').eq('author_id', id),
  ].map((p) => p.then(unwrap)));
  const media = new Set([prof.avatar_path, prof.theme?.bg_image, prof.music?.cover, ...cards.flatMap((c) => c.content?.images || []),
    ...photos.map((p) => p.path), ...posts.map((p) => p.image_path)].filter(Boolean));
  const audio = new Set([prof.music?.audio].filter(Boolean));
  let removed = 0;
  for (const [bucket, keep] of [[BUCKET, media], ['audio', audio]]) {
    const files = unwrap(await supabase.storage.from(bucket).list(id, { limit: 1000 }));
    const dead = files.filter((f) => f.name !== '.emptyFolderPlaceholder' && f.created_at && Date.now() - new Date(f.created_at) > graceMs && !keep.has(`${id}/${f.name}`)).map((f) => `${id}/${f.name}`);
    if (dead.length) { unwrap(await supabase.storage.from(bucket).remove(dead)); removed += dead.length; }
  }
  return removed;
}
