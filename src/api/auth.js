import { supabase, unwrap } from '../lib/client.js';
import { removeAllMyImages } from './media.js';

export async function usernameAvailable(username) {
  return unwrap(await supabase.rpc('username_available', { p_username: username }));
}

/** True when an admin banned this email (see spam_and_bans.sql). Only used to show the right message: the database blocks the sign-up itself. */
export async function emailBanned(email) {
  try { return (await supabase.rpc('email_banned', { p_email: email })).data === true; } catch { return false; }
}
/** Supabase hides trigger errors ("Database error saving new user"), so after any failure we ask whether the email is banned and throw a clear 'banned'. */
async function orBanned(email, fn) {
  try { return await fn(); } catch (e) { if (await emailBanned(email)) throw new Error('banned'); throw e; }
}

/** Username/display name are passed as metadata; a DB trigger creates the profile + starter cards. */
export async function signUp({ email, password, username, displayName, invitedBy }) {
  if (await emailBanned(email)) throw new Error('banned');
  if (!(await usernameAvailable(username))) throw new Error('username_taken');
  return orBanned(email, async () => unwrap(await supabase.auth.signUp({
    email, password,
    options: { data: { username: username.toLowerCase(), display_name: displayName || username, ...(/^[a-z0-9_]{3,24}$/.test(invitedBy || '') ? { invited_by: invitedBy } : {}) } },
  })));
}

export async function signIn({ email, password }) {
  return orBanned(email, async () => unwrap(await supabase.auth.signInWithPassword({ email, password })));
}
export async function signInWithMagicLink(email) {
  if (await emailBanned(email)) throw new Error('banned');
  return orBanned(email, async () => unwrap(await supabase.auth.signInWithOtp({ email })));
}
/** scope 'local' signs out this device only. The default ('global') revokes the user's sessions on every device. */
export async function signOut() { return unwrap({ error: (await supabase.auth.signOut({ scope: 'local' })).error }); }

export async function getSession() { return unwrap(await supabase.auth.getSession()).session; }
export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => cb(session, event));
  return () => data.subscription.unsubscribe();
}

/** GDPR-style: everything we hold about you, as JSON. */
export async function exportMyData() { return unwrap(await supabase.rpc('export_my_data')); }

/** Removes storage files first (SQL can't do that cleanly), then the account (cascades the rest). */
export async function deleteAccount() {
  await removeAllMyImages();
  unwrap(await supabase.rpc('delete_my_account'));
  await supabase.auth.signOut();
}

/** Sends a reset link; the page that opens handles the PASSWORD_RECOVERY event (see App.jsx). Never reveals whether the email exists. */
export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}${import.meta.env?.BASE_URL ?? '/'}` });
  if (error && error.status !== 400) throw error;
}
export async function updatePassword(password) { return unwrap(await supabase.auth.updateUser({ password })); }
