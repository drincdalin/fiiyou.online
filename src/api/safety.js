import { supabase, unwrap } from '../lib/client.js';

/** Blocking also removes friendship + top-8 entries both ways (DB trigger). */
export async function blockUser(userId) {
  const { data: { user } } = await supabase.auth.getUser();
  unwrap(await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: userId }));
}
export async function unblockUser(userId) {
  unwrap(await supabase.from('blocks').delete().eq('blocked_id', userId));
}
export async function listBlocked() {
  return unwrap(await supabase.from('blocks')
    .select('created_at, user:profiles!blocks_blocked_id_fkey(id, username, display_name, avatar_path)'));
}

/** targetType: 'profile' | 'post' | 'post_comment' | 'wall_comment'. Reports are read in the Supabase dashboard. */
export async function report(targetType, targetId, reason) {
  const { data: { user } } = await supabase.auth.getUser();
  unwrap(await supabase.from('reports').insert({ reporter_id: user.id, target_type: targetType, target_id: targetId, reason }));
}
