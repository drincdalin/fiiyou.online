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
/** Who liked MY photo, newest first (the database returns rows only to the photo's owner). */
export const listPhotoLikers = async (photoId) => unwrap(await supabase.rpc('photo_likers', { p_photo: photoId })) || [];

// ---------- notifications (rows are written by database triggers, see 0020_notifications.sql and 0025_wall_notifications.sql) ----------
// `recipient` is me (I only ever see my own rows). It is flattened to `profile_username` so a click on a wall comment or a
// photo like can open MY profile, where it happened.
export async function listNotifications(limit = 50) {
  const rows = unwrap(await supabase.from('notifications')
    .select('id, type, post_id, photo_id, read, created_at, actor:profiles!notifications_actor_id_fkey(id, username, display_name, avatar_path, is_official), recipient:profiles!notifications_user_id_fkey(username)')
    .order('created_at', { ascending: false }).limit(limit)) || [];
  return rows.map(({ recipient, ...r }) => ({ ...r, profile_username: recipient?.username || null }));
}
export async function unreadNotifications() {
  const r = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('read', false);
  if (r.error) throw r.error; return r.count || 0;
}
export const markNotificationsRead = async () => unwrap(await supabase.from('notifications').update({ read: true }).eq('read', false));
/** Live new notifications for me. Never throws; the bell also polls as a fallback. */
export function onNotification(myId, cb) {
  try {
    const ch = supabase.channel(`nt-${myId}-${Math.random().toString(36).slice(2)}`).on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${myId}` }, cb).subscribe();
    return () => { try { supabase.removeChannel(ch); } catch { /* ignore */ } };
  } catch { return () => {}; }
}

// ---------- push (this device's address for system notifications, see 0018_push.sql) ----------
export const savePushSubscription = async (sub) => unwrap(await supabase.rpc('save_push_subscription',
  { p_endpoint: sub.endpoint, p_p256dh: sub.keys.p256dh, p_auth: sub.keys.auth, p_ua: String(navigator.userAgent).slice(0, 200) }));
export const removePushSubscription = async (endpoint) => unwrap(await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint));

// ---------- places ----------
export const listPlaces = async () => unwrap(await supabase.rpc('places_overview'));
export async function createPlace({ name, description, lat, lng, localityId, osmRef = null }) {
  const r = await supabase.from('places').insert({ name: name.slice(0, 80), description: description || null, lat, lng, locality_id: localityId || null, osm_ref: osmRef, created_by: await uid() }).select().single();
  if (r.error?.code === '23505' && osmRef) return (await listPlaces()).find((p) => p.osm_ref === osmRef);   // someone added it first
  return unwrap(r);
}

/** Search real-world places (OpenStreetMap Nominatim). Call on submit only: the usage policy allows ~1 request/second
 *  and forbids search-as-you-type. The query and the visitor's IP go to OpenStreetMap. */
export async function searchPlaces(q, bounds) {
  const p = new URLSearchParams({ q, format: 'jsonv2', limit: '6', 'accept-language': 'ro,en' });
  if (bounds) p.set('viewbox', `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`);
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${p}`);
  if (!r.ok) throw new Error('Place search is unavailable right now.');
  return (await r.json()).map((x) => ({ ref: `${x.osm_type}/${x.osm_id}`, name: (x.name || x.display_name.split(',')[0]).slice(0, 80), label: x.display_name, lat: +x.lat, lng: +x.lon }));
}
export const deletePlace = async (id) => unwrap(await supabase.from('places').delete().eq('id', id));

// ---------- chat (friends only) ----------
export const conversations = async () => unwrap(await supabase.rpc('conversations'));
// reply_to points at the message being answered. `reply` ({id, sender_id, body} or null) is attached here instead of with a
// PostgREST self-join, which is ambiguous on a self-referencing table and came back as an empty array for every message.
const MSG_COLS = 'id, sender_id, body, created_at, reply_to, edited_at';
/** A deleted message keeps its row (so replies that quote it still work) but its text becomes this marker (0027_message_edit_delete.sql). */
export const DELETED_BODY = '[message deleted]';
/** Edit the text of MY message. Returns the updated row (body, edited_at). */
export const editMessage = async (id, body) => unwrap(await supabase.rpc('edit_message', { p_id: id, p_body: body }));
export const deleteMessage = async (id) => unwrap(await supabase.rpc('delete_message', { p_id: id }));
async function withReplies(rows) {
  const known = new Map(rows.map((r) => [r.id, r]));
  const missing = [...new Set(rows.map((r) => r.reply_to).filter((id) => id && !known.has(id)))];   // quoted messages older than the loaded window
  if (missing.length) unwrap(await supabase.from('messages').select('id, sender_id, body').in('id', missing)).forEach((r) => known.set(r.id, r));
  return rows.map((r) => ({ ...r, reply: r.reply_to ? known.get(r.reply_to) || null : null }));
}
export async function thread(peerId, limit = 100) {
  const me = await uid();
  const rows = unwrap(await supabase.from('messages').select(MSG_COLS)
    .or(`and(sender_id.eq.${me},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${me})`).order('created_at', { ascending: false }).limit(limit));
  return withReplies(rows.reverse());
}
export async function sendMessage(peerId, body, replyTo = null) {
  const m = unwrap(await supabase.from('messages').insert({ sender_id: await uid(), recipient_id: peerId, body, reply_to: replyTo || null }).select(MSG_COLS).single());
  return (await withReplies([m]))[0];
}
export const markRead = async (peerId) => unwrap(await supabase.rpc('mark_read', { p_peer: peerId }));
export const unreadCount = async () => Number(unwrap(await supabase.rpc('unread_count')));
/** Live incoming, edited and deleted messages. Each subscription gets its own channel name (a shared name made the second
 *  subscriber throw and blank the page). Never throws; the UI also polls as a fallback. */
export function onMessage(myId, cb) {
  try {
    const ch = supabase.channel(`dm-${myId}-${Math.random().toString(36).slice(2)}`).on('postgres_changes',
      { event: '*', schema: 'public', table: 'messages', filter: `recipient_id=eq.${myId}` }, cb).subscribe();
    return () => { try { supabase.removeChannel(ch); } catch { /* ignore */ } };
  } catch { return () => {}; }
}
