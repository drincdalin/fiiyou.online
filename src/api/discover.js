import { supabase, unwrap } from '../lib/client.js';

/** mode: 'random' (default) | 'new'. Excludes you, your friends/pending, blocked users. No ranking. */
export async function discover({ localityId = null, mode = 'random', limit = 20 } = {}) {
  return unwrap(await supabase.rpc('discover_profiles', { p_locality: localityId, p_mode: mode, p_limit: limit }));
}
/** Matches name or @username, ignoring accents ("stefan" finds "Ștefan"). localityId narrows it to one locality (needs migration 0024). */
export async function searchProfiles(query, limit = 20, localityId = null) {
  return unwrap(await supabase.rpc('search_profiles', { p_query: query, p_limit: limit, ...(localityId ? { p_locality: localityId } : {}) }));
}

// The API returns at most 1000 rows per request, so this pages through the table. Without it a list of ~1500 places would silently stop
// around the letter M. The result is kept for the rest of the session: every screen with a locality picker asks for it.
let localitiesCache = null;
export function listLocalities() {
  if (!localitiesCache) {
    localitiesCache = (async () => {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const rows = unwrap(await supabase.from('localities').select('*').order('name').order('id').range(from, from + 999)) || [];
        out.push(...rows); if (rows.length < 1000) break;
      }
      return out.sort((a, b) => a.name.localeCompare(b.name, 'ro'));
    })().catch((e) => { localitiesCache = null; throw e; });
  }
  return localitiesCache;
}

/** Friends who opted in, pinned at their locality's coordinates (skip rows where lat/lng is null).
 *  Add a small random offset on the client so people in one village don't stack on one pixel. */
export async function friendsMap() { return unwrap(await supabase.rpc('friends_map')); }
