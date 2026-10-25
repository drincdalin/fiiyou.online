import { supabase, unwrap } from '../lib/client.js';
// Every call is re-checked by the database (is_admin()); hiding the UI is only a convenience.
const rpc = async (fn, args) => unwrap(await supabase.rpc(fn, args));
export const isAdmin = async () => { try { return !!(await rpc('is_admin')); } catch { return false; } };
export const stats = () => rpc('admin_stats');
export const reports = (status = 'open') => rpc('admin_reports', { p_status: status });
export const setReport = (id, status) => rpc('admin_set_report', { p_id: id, p_status: status });
export const deleteComment = (type, id) => rpc('admin_delete_comment', { p_type: type, p_id: id });
export const setVerified = (id, on) => rpc('admin_set_verified', { p_profile: id, p_on: on });
export const searchUsers = (q) => rpc('admin_search_users', { p_q: q || '' });
export const log = () => rpc('admin_log', { p_limit: 50 });

async function removeFiles(bucket, paths) { for (let i = 0; i < paths.length; i += 100) unwrap(await supabase.storage.from(bucket).remove(paths.slice(i, i + 100))); }
/** Deletes the post, then its image file (SQL can't delete files; the Storage API can, and admins are allowed to). */
export async function deletePost(id) { const path = await rpc('admin_delete_post', { p_id: id }); if (path) await removeFiles('media', [path]); }
/** Removes every file the person owns first, then the account (everything else cascades). */
export async function deleteUser(id) {
  for (const b of ['media', 'audio']) {
    const files = unwrap(await supabase.storage.from(b).list(id, { limit: 1000 }));
    const paths = files.filter((f) => f.name !== '.emptyFolderPlaceholder').map((f) => `${id}/${f.name}`);
    if (paths.length) await removeFiles(b, paths);
  }
  await rpc('admin_delete_user', { p_user: id });
}
/** Files in storage that nothing references (older than the grace period, so uploads in progress are safe). */
export async function findOrphans(graceMs = 2 * 3600e3) {
  const keep = { media: new Set(), audio: new Set() }; (await rpc('admin_referenced_paths')).forEach((r) => keep[r.bucket]?.add(r.path));
  const out = { media: [], audio: [] };
  for (const b of ['media', 'audio']) {
    const top = unwrap(await supabase.storage.from(b).list('', { limit: 1000 }));
    for (const folder of top.filter((x) => x.id === null)) {
      for (const f of unwrap(await supabase.storage.from(b).list(folder.name, { limit: 1000 }))) {
        const path = `${folder.name}/${f.name}`;
        if (f.name === '.emptyFolderPlaceholder' || !f.created_at || Date.now() - new Date(f.created_at) < graceMs || keep[b].has(path)) continue;
        out[b].push({ path, size: f.metadata?.size || 0 });
      }
    }
  }
  return out;
}
export async function removeOrphans(found) { for (const b of ['media', 'audio']) if (found[b].length) await removeFiles(b, found[b].map((x) => x.path)); }
