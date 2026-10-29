import { supabase, unwrap } from '../lib/client.js';

/** mode: 'random' (default) | 'new'. Excludes you, your friends/pending, blocked users. No ranking. */
export async function discover({ localityId = null, mode = 'random', limit = 20 } = {}) {
  return unwrap(await supabase.rpc('discover_profiles', { p_locality: localityId, p_mode: mode, p_limit: limit }));
}
/** Matches name or @username, ignoring accents ("stefan" finds "Ștefan"). localityId narrows it to one locality (needs migration 0024). */
export async function searchProfiles(query, limit = 20, localityId = null) {
  return unwrap(await supabase.rpc('search_profiles', { p_query: query, p_limit: limit, ...(localityId ? { p_locality: localityId } : {}) }));
}

export async function listLocalities() {
  return unwrap(await supabase.from('localities').select('*').order('name'));
}

/** Friends who opted in, pinned at their locality's coordinates (skip rows where lat/lng is null).
 *  Add a small random offset on the client so people in one village don't stack on one pixel. */
export async function friendsMap() { return unwrap(await supabase.rpc('friends_map')); }
