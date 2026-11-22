import { supabase, unwrap } from '../lib/client.js';
// Every call is re-checked by the database (is_admin()); hiding the UI is only a convenience.
const rpc = async (fn, args) => unwrap(await supabase.rpc(fn, args));
export const isAdmin = async () => { try { return !!(await rpc('is_admin')); } catch { return false; } };
/** 'admin' | 'moderator' | null. Display only (which tabs to show): the database re-checks the role on every call. */
export const role = async () => {
  try { return (await rpc('staff_role')) || null; }
  catch { return (await isAdmin()) ? 'admin' : null; }   // migration 0035 not run yet: an admin keeps the Admin tab
};
export const stats = () => rpc('admin_stats');
export const reports = (status = 'open') => rpc('admin_reports', { p_status: status });
export const setReport = (id, status) => rpc('admin_set_report', { p_id: id, p_status: status });
/** Reasons for removing a post or comment (same codes as the database). 'custom' needs a written reason (5+ characters). The author is emailed the reason. */
export const CONTENT_REASONS = [
  ['guidelines', 'Violates Community Guidelines'],
  ['spam', 'Spam / Commercial Abuse'],
  ['explicit', 'Explicit or Inappropriate Content'],
  ['abuse', 'Abuse / Harassment'],
  ['custom', 'Custom Reason'],
];
/** type = 'post_comment' | 'wall_comment'. A reason is required; the author gets an email with it. Returns { notified }. */
export const deleteComment = (type, id, reasonCode, reasonText) => rpc('admin_delete_comment', { p_type: type, p_id: id, p_reason_code: reasonCode, p_reason_text: reasonText || null });
export const setVerified = (id, on) => rpc('admin_set_verified', { p_profile: id, p_on: on });
export const searchUsers = (q) => rpc('admin_search_users', { p_q: q || '' });
export const log = () => rpc('admin_log', { p_limit: 50 });
export const setModerator = (id, on) => rpc('admin_set_moderator', { p_user: id, p_on: on });

/** Predefined reasons for removing a place. 'custom' needs a written reason. Codes must match the CHECK on deletion_log. */
export const DELETION_REASONS = [
  ['guidelines', 'Violates Community Guidelines'],
  ['inaccurate_location', 'Inaccurate Location Data'],
  ['spam', 'Spam / Commercial Abuse'],
  ['duplicate', 'Duplicate Marker'],
  ['custom', 'Custom Reason'],
];
/** Any moderator or admin may remove any place. Closes its open reports, logs it, and emails the creator the chosen reason. */
export const deletePlace = (id, reasonCode, reasonText) => rpc('admin_delete_place', { p_id: id, p_reason_code: reasonCode, p_reason_text: reasonText || null });
export const deletionLog = () => rpc('admin_deletion_log', { p_limit: 50 });

async function removeFiles(bucket, paths) { for (let i = 0; i < paths.length; i += 100) unwrap(await supabase.storage.from(bucket).remove(paths.slice(i, i + 100))); }
/** Deletes the post (a reason is required, the author is emailed it), then ALL its photo files: first photo and extra photos.
 *  SQL can't delete files; the Storage API can, and staff are allowed to. Returns { notified }. */
export async function deletePost(id, reasonCode, reasonText) {
  const r = await rpc('admin_delete_post', { p_id: id, p_reason_code: reasonCode, p_reason_text: reasonText || null });
  if (r?.paths?.length) await removeFiles('media', r.paths);
  return r;
}

/** Removes every file the person owns in all three buckets (media, audio, fonts) (shared by deleteUser and banUser). */
async function removeUserFiles(id) {
  for (const b of ['media', 'audio', 'fonts']) {
    try {
      const files = unwrap(await supabase.storage.from(b).list(id, { limit: 1000 }));
      const paths = files.filter((f) => f.name !== '.emptyFolderPlaceholder').map((f) => `${id}/${f.name}`);
      if (paths.length) await removeFiles(b, paths);
    } catch (e) { if (b !== 'fonts') throw e; }   // fonts: best effort (staff may have no delete right on that bucket); it must never block a ban
  }
}
/** Removes every file the person owns first, then the account (everything else cascades). */
export async function deleteUser(id) {
  await removeUserFiles(id);
  await rpc('admin_delete_user', { p_user: id });
}
/** Same as deleteUser, but the database also remembers the (hashed) email so it can never sign up again. */
export async function banUser(id, reason, userMessage) {
  await removeUserFiles(id);
  return rpc('admin_ban_user', { p_user: id, p_reason: reason || null, p_user_message: userMessage || null });   // p_reason is internal; p_user_message is emailed to the person
}

/** Emails queued for members (ban notices, removed posts...). Admin only. Rows: { id, kind, username, status, attempts, last_error, created_at, sent_at }. Needs migration 0036. */
export const outbox = () => rpc('admin_outbox', { p_limit: 50 });
/** Puts a failed or stuck email back in the queue; it goes out the next time the Edge Function is called with {"retry":true}. */
export const requeueEmail = (id) => rpc('admin_requeue_email', { p_id: id });
/** Undo a ban by email (not used in the UI yet). */
export const unbanEmail = (email) => rpc('admin_unban_email', { p_email: email });

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
