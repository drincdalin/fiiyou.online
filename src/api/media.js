import { supabase, unwrap } from '../lib/client.js';

const BUCKET = 'media';
const MAX_BYTES = 1_500_000;        // keep under bucket limit (1572864)

/**
 * Downscale + convert to webp in the browser so free-tier storage lasts.
 * GIFs are passed through untouched (to keep the animation) and must already be < MAX_BYTES.
 */
export async function compressImage(file, { maxSize = 1600, quality = 0.82 } = {}) {
  if (file.type === 'image/gif') {
    if (file.size > MAX_BYTES) throw new Error('gif_too_large');
    return file;
  }
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  let q = quality, blob;
  do {                                // step quality down until it fits
    blob = await canvas.convertToBlob({ type: 'image/webp', quality: q });
    q -= 0.12;
  } while (blob.size > MAX_BYTES && q > 0.3);
  if (blob.size > MAX_BYTES) throw new Error('image_too_large');
  return blob;
}

async function myId() {
  const { data } = await supabase.auth.getUser();
  if (!data?.user) throw new Error('not_authenticated');
  return data.user.id;
}

/** Uploads and returns the storage path (store THIS in avatar_path / card content / posts). */
export async function uploadImage(file) {
  const blob = await compressImage(file);
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
