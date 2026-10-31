import { supabase, unwrap } from '../lib/client.js';

/** Blocking also removes friendship + top-8 entries both ways (DB trigger). */
export async function blockUser(userId) {
  const { data: { user } } = await supabase.auth.getUser();
  unwrap(await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: userId }));
}
export async function unblockUser(userId) {
  unwrap(await supabase.from('blocks').delete().eq('blocked_id', userId));
}
/** [{ created_at, user: { id, username, display_name, avatar_path } }], newest first.
 *  Goes through list_blocked() (0030): the profiles policy hides a blocked person from the one who blocked them, so a plain join would return nothing. */
export async function listBlocked() {
  const rows = unwrap(await supabase.rpc('list_blocked'));
  return (rows || []).map((r) => ({ created_at: r.blocked_at, user: { id: r.id, username: r.username, display_name: r.display_name, avatar_path: r.avatar_path } }));
}

/** targetType: 'profile' | 'post' | 'post_comment' | 'wall_comment'. Reports are read in the Supabase dashboard. */
export async function report(targetType, targetId, reason) {
  const { data: { user } } = await supabase.auth.getUser();
  unwrap(await supabase.from('reports').insert({ reporter_id: user.id, target_type: targetType, target_id: targetId, reason }));
}
