import { supabase, unwrap } from '../lib/client.js';

const AUTHOR = 'author:profiles!wall_comments_author_id_fkey(id, username, display_name, avatar_path)';

export async function listWall(profileId, { before = null, limit = 20 } = {}) {
  let q = supabase.from('wall_comments').select(`id, body, created_at, ${AUTHOR}`)
    .eq('profile_id', profileId).order('created_at', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  return unwrap(await q);
}

export async function postOnWall(profileId, body) {
  const { data: { user } } = await supabase.auth.getUser();
  return unwrap(await supabase.from('wall_comments')
    .insert({ profile_id: profileId, author_id: user.id, body }).select(`id, body, created_at, ${AUTHOR}`).single());
}

/** allowed for the comment's author and for the wall owner */
export async function deleteWallComment(id) { unwrap(await supabase.from('wall_comments').delete().eq('id', id)); }
