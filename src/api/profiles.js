import { supabase, unwrap } from '../lib/client.js';
import { uploadImage, deleteImage } from './media.js';

const EDITABLE = ['display_name', 'headline', 'bio', 'locality_id', 'show_on_map', 'wall_policy', 'theme'];

export async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return unwrap(await supabase.from('profiles').select('*, locality:localities(*)').eq('id', user.id).single());
}

/** Everything the profile page needs, in one round of parallel queries. */
export async function getFullProfile(username) {
  const profile = unwrap(await supabase.from('profiles')
    .select('*, locality:localities(id, name, slug)').eq('username', username.toLowerCase()).maybeSingle());
  if (!profile) return null;
  const [cards, top, friendCount, relationship] = await Promise.all([
    supabase.from('profile_cards').select('*').eq('profile_id', profile.id).eq('visible', true).order('z'),
    supabase.from('top_friends')
      .select('rank, friend:profiles!top_friends_friend_id_fkey(id, username, display_name, avatar_path)')
      .eq('profile_id', profile.id).order('rank'),
    supabase.rpc('friends_of', { p_profile: profile.id }),
    relationshipWith(profile.id),
  ]);
  return {
    profile,
    cards: unwrap(cards),
    topFriends: unwrap(top).map(t => ({ rank: t.rank, ...t.friend })),
    friendCount: unwrap(friendCount).length,
    relationship,
  };
}

/** 'self' | 'friends' | 'pending_sent' | 'pending_received' | 'none' (+ request id when pending) */
export async function relationshipWith(otherId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (user.id === otherId) return { status: 'self' };
  const rows = unwrap(await supabase.from('friendships').select('id, requester_id, addressee_id, status')
    .or(`and(requester_id.eq.${user.id},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${user.id})`));
  const f = rows[0];
  if (!f) return { status: 'none' };
  if (f.status === 'accepted') return { status: 'friends', id: f.id };
  return { status: f.requester_id === user.id ? 'pending_sent' : 'pending_received', id: f.id };
}

export async function updateMyProfile(patch) {
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => EDITABLE.includes(k)));
  const { data: { user } } = await supabase.auth.getUser();
  return unwrap(await supabase.from('profiles').update(clean).eq('id', user.id).select().single());
}

/** theme keys: bg_color, text_color, link_color, accent_color, border_color, bg_image, bg_repeat, font, cursor */
export const updateTheme = (theme) => updateMyProfile({ theme });

export async function setAvatar(file) {
  const me = await getMyProfile();
  const path = await uploadImage(file);
  const updated = unwrap(await supabase.from('profiles').update({ avatar_path: path }).eq('id', me.id).select().single());
  if (me.avatar_path) await deleteImage(me.avatar_path).catch(() => {});   // don't leak old files
  return updated;
}

export async function setBackgroundImage(file) {
  const me = await getMyProfile();
  const path = await uploadImage(file);
  const theme = { ...me.theme, bg_image: path };
  const updated = await updateTheme(theme);
  if (me.theme?.bg_image) await deleteImage(me.theme.bg_image).catch(() => {});
  return updated;
}
