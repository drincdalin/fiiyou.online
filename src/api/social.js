import { supabase, unwrap } from '../lib/client.js';
import { uploadImage, deleteImage } from './media.js';
const uid = async () => (await supabase.auth.getUser()).data.user.id;

// ---------- photos (gallery) ----------
export const listPhotos = async (profileId) => unwrap(await supabase.rpc('photos_of', { p_profile: profileId }));
export async function addPhoto(file) {
  const owner_id = await uid(); const path = await uploadImage(file, 'photo');
  const { data } = await supabase.from('photos').select('position').eq('owner_id', owner_id).order('position', { ascending: false }).limit(1);
  const r = await supabase.from('photos').insert({ owner_id, path, position: (data?.[0]?.position ?? 0) + 1 }).select().single();
  if (r.error) deleteImage(path).catch(() => {});
  return unwrap(r);
}
export const setCaption = async (id, caption) => unwrap(await supabase.from('photos').update({ caption: caption || null }).eq('id', id));
export async function deletePhoto(photo) { unwrap(await supabase.from('photos').delete().eq('id', photo.id)); deleteImage(photo.path).catch(() => {}); }
export const reorderPhotos = async (ids) => unwrap(await supabase.rpc('reorder_photos', { p_ids: ids }));
export async function setPhotoLike(photoId, on) {
  const user_id = await uid();
  if (on) unwrap(await supabase.from('photo_likes').insert({ photo_id: photoId, user_id }));
  else unwrap(await supabase.from('photo_likes').delete().eq('photo_id', photoId).eq('user_id', user_id));
}

// ---------- places ----------
export const listPlaces = async () => unwrap(await supabase.rpc('places_overview'));
export async function createPlace({ name, description, lat, lng, localityId }) {
  return unwrap(await supabase.from('places').insert({ name, description: description || null, lat, lng, locality_id: localityId || null, created_by: await uid() }).select().single());
}
export const deletePlace = async (id) => unwrap(await supabase.from('places').delete().eq('id', id));

// ---------- chat (friends only) ----------
export const conversations = async () => unwrap(await supabase.rpc('conversations'));
export async function thread(peerId, limit = 100) {
  const me = await uid();
  const rows = unwrap(await supabase.from('messages').select('id, sender_id, body, created_at')
    .or(`and(sender_id.eq.${me},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${me})`).order('created_at', { ascending: false }).limit(limit));
  return rows.reverse();
}
export async function sendMessage(peerId, body) {
  return unwrap(await supabase.from('messages').insert({ sender_id: await uid(), recipient_id: peerId, body }).select('id, sender_id, body, created_at').single());
}
export const markRead = async (peerId) => unwrap(await supabase.rpc('mark_read', { p_peer: peerId }));
export const unreadCount = async () => Number(unwrap(await supabase.rpc('unread_count')));
/** Live incoming messages (needs the realtime publication; the UI also polls as a fallback). */
export function onMessage(myId, cb) {
  const ch = supabase.channel('dm-' + myId).on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${myId}` }, cb).subscribe();
  return () => supabase.removeChannel(ch);
}
