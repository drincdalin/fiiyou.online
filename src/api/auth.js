import { supabase, unwrap } from '../lib/client.js';
import { removeAllMyImages } from './media.js';

export async function usernameAvailable(username) {
  return unwrap(await supabase.rpc('username_available', { p_username: username }));
}

/** Username/display name are passed as metadata; a DB trigger creates the profile + starter cards. */
export async function signUp({ email, password, username, displayName }) {
  if (!(await usernameAvailable(username))) throw new Error('username_taken');
  return unwrap(await supabase.auth.signUp({
    email, password,
    options: { data: { username: username.toLowerCase(), display_name: displayName || username } },
  }));
}

export async function signIn({ email, password }) {
  return unwrap(await supabase.auth.signInWithPassword({ email, password }));
}
export async function signInWithMagicLink(email) {
  return unwrap(await supabase.auth.signInWithOtp({ email }));
}
export async function signOut() { return unwrap({ error: (await supabase.auth.signOut()).error }); }

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
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}${location.pathname}` });
  if (error && error.status !== 400) throw error;
}
export async function updatePassword(password) { return unwrap(await supabase.auth.updateUser({ password })); }
