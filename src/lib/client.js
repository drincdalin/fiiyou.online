import { createClient } from '@supabase/supabase-js';

// Vite exposes import.meta.env; fall back to process.env for node scripts.
const env = import.meta.env ?? process.env;

export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Throws on error, returns data otherwise. Every api function uses this. */
export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

/** Postgres/RPC error messages we raise on purpose -> stable codes for the UI. */
export function errorCode(err) {
  const m = (err?.message ?? '').toLowerCase();
  for (const c of ['rate_limit', 'card_limit', 'not_authenticated', 'not_found', 'cannot_friend_self',
                   'too_many', 'duplicates', 'not_friends', 'bad_layout']) {
    if (m.includes(c)) return c;
  }
  if (err?.code === '23505') return 'duplicate';
  if (err?.code === '23514') return 'invalid_value';     // CHECK constraint (theme, card content, lengths)
  if (err?.code === '42501') return 'forbidden';         // RLS
  return 'unknown';
}

export const PROFILE_PUBLIC = 'id, username, display_name, avatar_path, locality_id';
