import { supabase, unwrap } from '../lib/client.js';
import { uploadImage, deleteImage } from './media.js';
const uid = async () => (await supabase.auth.getUser()).data.user.id;

/** Newest-first (or soonest-first with upcoming:true). Page with `before` = last item's created_at. */
export async function feed({ localityId = null, onlyFriends = false, before = null, limit = 20, kind = null, placeId = null, upcoming = false, noEvents = false } = {}) {
  return unwrap(await supabase.rpc('local_feed', { p_locality: localityId, p_only_friends: onlyFriends, p_before: before, p_limit: limit,
    p_kind: kind, p_place: placeId, p_upcoming: upcoming, p_no_events: noEvents }));
}

export const MAX_IMAGES = 4;   // first image + up to 3 extra ones (see 0029_search_schedule_pins_images.sql)

/** Uploads up to MAX_IMAGES files; the first becomes image_path, the rest extra_images. Cleans up after itself when one upload fails. */
async function uploadAll(files, kind) {
  const list = (files || []).filter(Boolean).slice(0, MAX_IMAGES); const paths = [];
  try { for (const f of list) paths.push(await uploadImage(f, kind === 'event' ? 'event' : 'post')); }
  catch (e) { await Promise.all(paths.map((x) => deleteImage(x).catch(() => {}))); throw e; }
  return { image_path: paths[0] || null, extra_images: paths.slice(1), all: paths };
}

/** kind: status | ask | event (event needs eventAt; title is for events). Images (imageFiles, or the old single imageFile) are compressed before upload. */
export async function createPost({ body, kind = 'status', title = null, localityId = null, placeId = null, visibility = 'public', eventAt = null, eventPlace = null, imageFile = null, imageFiles = null }) {
  const author_id = await uid();
  const up = await uploadAll(imageFiles || (imageFile ? [imageFile] : []), kind);
  const r = await supabase.from('posts').insert({ author_id, body, kind, title, locality_id: localityId, place_id: placeId, visibility,
    event_at: eventAt, event_place: eventPlace, image_path: up.image_path, ...(up.extra_images.length ? { extra_images: up.extra_images } : {}) }).select().single();   // the column only exists after 0029; single-photo posts keep working before it
  if (r.error) await Promise.all(up.all.map((x) => deleteImage(x).catch(() => {})));
  return unwrap(r);
}

/** Same fields as createPost plus publishAt (Date or ISO string). The post waits in scheduled_posts and is published at that time. */
export async function schedulePost({ publishAt, body, kind = 'status', title = null, localityId = null, placeId = null, visibility = 'public', eventAt = null, eventPlace = null, imageFiles = null }) {
  const author_id = await uid();
  const up = await uploadAll(imageFiles, kind);
  const r = await supabase.from('scheduled_posts').insert({ author_id, publish_at: new Date(publishAt).toISOString(), body, kind, title, locality_id: localityId, place_id: placeId,
    visibility, event_at: eventAt, event_place: eventPlace, image_path: up.image_path, extra_images: up.extra_images }).select().single();
  if (r.error) await Promise.all(up.all.map((x) => deleteImage(x).catch(() => {})));
  return unwrap(r);
}
export const listScheduled = async () => unwrap(await supabase.from('scheduled_posts').select('id, kind, title, body, publish_at, image_path, extra_images, visibility').order('publish_at')) || [];
export async function cancelScheduled(row) {
  unwrap(await supabase.from('scheduled_posts').delete().eq('id', row.id));
  await Promise.all([row.image_path, ...(row.extra_images || [])].filter(Boolean).map((x) => deleteImage(x).catch(() => {})));
}
/** Moves posts whose time has come into the feed. Safe to call as often as you like; returns how many were published. */
export const publishDue = async () => Number(unwrap(await supabase.rpc('publish_due_posts')) || 0);

export async function updatePost(id, { body, title }, { removeImage = false, oldImage = null, oldExtras = [] } = {}) {
  const patch = { body }; if (title !== undefined) patch.title = title; if (removeImage) { patch.image_path = null; patch.extra_images = []; }
  const r = unwrap(await supabase.from('posts').update(patch).eq('id', id).select().single());
  if (removeImage) [oldImage, ...(oldExtras || [])].filter(Boolean).forEach((x) => deleteImage(x).catch(() => {}));
  return r;
}
export async function deletePost(id, imagePath, extraImages = []) {
  unwrap(await supabase.from('posts').delete().eq('id', id));
  [imagePath, ...(extraImages || [])].filter(Boolean).forEach((x) => deleteImage(x).catch(() => {}));
}
export async function setLike(postId, on) {
  const user_id = await uid();
  if (on) unwrap(await supabase.from('post_likes').insert({ post_id: postId, user_id }));
  else unwrap(await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user_id));
}
/** Who liked MY post, newest first (the database returns rows only to the post's author). See 0016_likers_and_views.sql. */
export const listLikers = async (postId) => unwrap(await supabase.rpc('post_likers', { p_post: postId })) || [];
/** Comments of one post, oldest first, each with { parent_id, reply_to, like_count, liked } (see 0028_comment_likes_replies_mentions.sql).
 *  parent_id = the thread root (null for top-level comments); reply_to = the comment that was actually answered. */
export async function listComments(postId) {
  const [rows, likes] = await Promise.all([
    supabase.from('post_comments')
      .select('id, body, created_at, parent_id, reply_to, author:profiles!post_comments_author_id_fkey(id, username, display_name, avatar_path)').eq('post_id', postId).order('created_at').then(unwrap),
    supabase.rpc('comment_likes_for', { p_post: postId }).then(unwrap).catch(() => []),   // likes failing must not hide the comments
  ]);
  const by = new Map((likes || []).map((l) => [l.comment_id, l]));
  return (rows || []).map((c) => ({ ...c, like_count: Number(by.get(c.id)?.like_count || 0), liked: !!by.get(c.id)?.liked }));
}
/** parentId = the comment the person clicked "Reply" on (the database flattens it to the thread root). */
export async function addComment(postId, body, parentId = null) {
  return unwrap(await supabase.from('post_comments').insert({ post_id: postId, author_id: await uid(), body, parent_id: parentId || null }).select().single());
}
export async function setCommentLike(commentId, on) {
  const user_id = await uid();
  if (on) unwrap(await supabase.from('comment_likes').insert({ comment_id: commentId, user_id }));
  else unwrap(await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', user_id));
}
/** People for the @mention popup: username or name starts with `word`. */
export async function searchUsers(word, limit = 6) {
  const w = String(word || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 30);
  const sel = 'id, username, display_name, avatar_path';
  const [a, b] = await Promise.all([
    supabase.from('profiles').select(sel).ilike('username', `${w}%`).limit(limit).then(unwrap),
    w ? supabase.from('profiles').select(sel).ilike('display_name', `${w}%`).limit(limit).then(unwrap) : [],
  ]);
  const seen = new Set();
  return [...(a || []), ...(b || [])].filter((u) => !seen.has(u.id) && seen.add(u.id)).slice(0, limit);
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

/** Public posts whose title or text contains `query` (diacritics ignored), newest first, same shape as feed() rows.
 *  Works like tagFeed(): the database lists ids (0029), each post is then loaded through getPost(), which applies the visibility rules. */
export async function searchPosts({ query, before = null, limit = 20 } = {}) {
  const ids = unwrap(await supabase.rpc('search_post_ids', { p_query: query, p_before: before, p_limit: limit })) || [];
  const rows = (await Promise.all(ids.map((r) => getPost(r.id).catch(() => null)))).filter(Boolean);
  return { rows, cursor: ids.length ? ids[ids.length - 1].created_at : null, more: ids.length === limit };
}
/** [{ tag, uses }] hashtags starting with the query. */
export const searchTags = async (query, limit = 8) => unwrap(await supabase.rpc('search_tags', { p_query: query, p_limit: limit })) || [];
