import { supabase, unwrap } from '../lib/client.js';
import { uploadImage } from './media.js';

/** kind: 'status' | 'event' | 'ask'   visibility: 'public' | 'friends'   (event needs eventAt) */
export async function createPost({ body, kind = 'status', localityId = null, visibility = 'public', eventAt = null, eventPlace = null, imageFile = null }) {
  const { data: { user } } = await supabase.auth.getUser();
  const image_path = imageFile ? await uploadImage(imageFile) : null;
  return unwrap(await supabase.from('posts').insert({
    author_id: user.id, body, kind, visibility, image_path,
    locality_id: localityId, event_at: eventAt, event_place: eventPlace,
  }).select().single());
}

export async function deletePost(id) { unwrap(await supabase.from('posts').delete().eq('id', id)); }

/** Strictly newest-first. Paginate by passing the last item's created_at as `before`. */
export async function localFeed({ localityId = null, onlyFriends = false, before = null, limit = 20, kind = null } = {}) {
  return unwrap(await supabase.rpc('local_feed', {
    p_locality: localityId, p_only_friends: onlyFriends, p_before: before, p_limit: limit, p_kind: kind,
  }));
}

/** Upcoming local events, soonest first (events stay listed for 3h after they start). */
export async function upcomingEvents({ localityId = null, limit = 20 } = {}) {
  let q = supabase.from('posts')
    .select('id, body, event_at, event_place, locality_id, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_path)')
    .eq('kind', 'event').gte('event_at', new Date(Date.now() - 3 * 3600e3).toISOString())
    .order('event_at').limit(limit);
  if (localityId) q = q.eq('locality_id', localityId);
  return unwrap(await q);
}

export async function listComments(postId) {
  return unwrap(await supabase.from('post_comments')
    .select('id, body, created_at, author:profiles!post_comments_author_id_fkey(id, username, display_name, avatar_path)')
    .eq('post_id', postId).order('created_at'));
}
export async function addComment(postId, body) {
  const { data: { user } } = await supabase.auth.getUser();
  return unwrap(await supabase.from('post_comments').insert({ post_id: postId, author_id: user.id, body }).select().single());
}
export async function deleteComment(id) { unwrap(await supabase.from('post_comments').delete().eq('id', id)); }
