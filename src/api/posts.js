import { supabase, unwrap } from '../lib/client.js';
import { uploadImage, deleteImage } from './media.js';
const uid = async () => (await supabase.auth.getUser()).data.user.id;

/** Newest-first (or soonest-first with upcoming:true). Page with `before` = last item's created_at. */
export async function feed({ localityId = null, onlyFriends = false, before = null, limit = 20, kind = null, placeId = null, upcoming = false, noEvents = false } = {}) {
  return unwrap(await supabase.rpc('local_feed', { p_locality: localityId, p_only_friends: onlyFriends, p_before: before, p_limit: limit,
    p_kind: kind, p_place: placeId, p_upcoming: upcoming, p_no_events: noEvents }));
}

/** kind: status | ask | event (event needs eventAt; title is for events). Image is compressed before upload. */
export async function createPost({ body, kind = 'status', title = null, localityId = null, placeId = null, visibility = 'public', eventAt = null, eventPlace = null, imageFile = null }) {
  const author_id = await uid();
  const image_path = imageFile ? await uploadImage(imageFile, kind === 'event' ? 'event' : 'post') : null;
  const r = await supabase.from('posts').insert({ author_id, body, kind, title, locality_id: localityId, place_id: placeId, visibility,
    event_at: eventAt, event_place: eventPlace, image_path }).select().single();
  if (r.error && image_path) deleteImage(image_path).catch(() => {});
  return unwrap(r);
}

export async function updatePost(id, { body, title }, { removeImage = false, oldImage = null } = {}) {
  const patch = { body }; if (title !== undefined) patch.title = title; if (removeImage) patch.image_path = null;
  const r = unwrap(await supabase.from('posts').update(patch).eq('id', id).select().single());
  if (removeImage && oldImage) deleteImage(oldImage).catch(() => {});
  return r;
}
export async function deletePost(id, imagePath) {
  unwrap(await supabase.from('posts').delete().eq('id', id));
  if (imagePath) deleteImage(imagePath).catch(() => {});
}
export async function setLike(postId, on) {
  const user_id = await uid();
  if (on) unwrap(await supabase.from('post_likes').insert({ post_id: postId, user_id }));
  else unwrap(await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user_id));
}
/** Who liked MY post, newest first (the database returns rows only to the post's author). See 0016_likers_and_views.sql. */
export const listLikers = async (postId) => unwrap(await supabase.rpc('post_likers', { p_post: postId })) || [];
export async function listComments(postId) {
  return unwrap(await supabase.from('post_comments')
    .select('id, body, created_at, author:profiles!post_comments_author_id_fkey(id, username, display_name, avatar_path)').eq('post_id', postId).order('created_at'));
}
export async function addComment(postId, body) {
  return unwrap(await supabase.from('post_comments').insert({ post_id: postId, author_id: await uid(), body }).select().single());
}
export async function deleteComment(id) { unwrap(await supabase.from('post_comments').delete().eq('id', id)); }

/** One post in the same shape as feed() rows, or null when it does not exist or this person may not see it (see 0015_get_post.sql). */
export async function getPost(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) return null;
  return unwrap(await supabase.rpc('get_post', { p_id: id }))[0] || null;
}

/** Public posts that carry #tag, newest first, in the same shape as feed() rows. The database lists the ids (0026_hashtags.sql);
 *  each post is then loaded through getPost(), which applies the usual visibility rules. `cursor` pages the next call (pass it as `before`). */
export async function tagFeed({ tag, before = null, limit = 20 } = {}) {
  const ids = unwrap(await supabase.rpc('tag_post_ids', { p_tag: tag, p_before: before, p_limit: limit })) || [];
  const rows = (await Promise.all(ids.map((r) => getPost(r.id).catch(() => null)))).filter(Boolean);
  return { rows, cursor: ids.length ? ids[ids.length - 1].created_at : null, more: ids.length === limit };
}
/** [{ tag, uses }] most used in public posts over the last `days` days. */
export const trendingTags = async (days = 7, limit = 8) => unwrap(await supabase.rpc('trending_tags', { p_days: days, p_limit: limit })) || [];
