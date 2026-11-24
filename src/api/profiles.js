import { supabase, unwrap } from '../lib/client.js';
import { uploadImage, deleteImage } from './media.js';
import { cleanPhoneTheme } from '../lib/phoneLayout.js';

const EDITABLE = ['display_name', 'headline', 'bio', 'locality_id', 'show_on_map', 'wall_policy', 'theme', 'music', 'custom_css', 'onboarded_at', 'phone_theme'];

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
  const [cards, top, friendRows, relationship, photos, views, badgeRows, likeRows] = await Promise.all([
    supabase.from('profile_cards').select('*').eq('profile_id', profile.id).eq('visible', true).order('y').order('z'),
    supabase.from('top_friends')
      .select('rank, friend:profiles!top_friends_friend_id_fkey(id, username, display_name, avatar_path)')
      .eq('profile_id', profile.id).order('rank'),
    supabase.rpc('friends_of', { p_profile: profile.id }),
    relationshipWith(profile.id),
    supabase.rpc('photos_of', { p_profile: profile.id }),
    supabase.rpc('profile_view_count', { p_profile: profile.id }),
    supabase.from('profile_badges').select('kind').eq('profile_id', profile.id),
    supabase.rpc('profile_like_state', { p_profile: profile.id }),
  ]);
  const friendProfiles = unwrap(friendRows);
  const [likeState] = unwrap(likeRows) || [];
  return {
    profile,
    cards: unwrap(cards),
    topFriends: unwrap(top).map(t => ({ rank: t.rank, ...t.friend })),
    friendProfiles,
    friendCount: friendProfiles.length,
    relationship,
    photos: unwrap(photos),
    views: Number(unwrap(views)),
    badges: (unwrap(badgeRows) || []).map((b) => b.kind),
    profileLikes: { count: Number(likeState?.count || 0), liked: !!likeState?.liked },
  };
}

/** Registers one visit to someone else's profile (every visit counts). The database ignores your own profile and blocked pairs.
 *  Call it once when the profile page opens, NOT from getFullProfile: that one re-runs after every friend / like action. */
export const recordView = async (profileId) => { await supabase.rpc('record_profile_view', { p_profile: profileId }); };

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
  if (clean.music && typeof clean.music === 'object') { const { audio, ...rest } = clean.music; clean.music = rest; }   // uploaded audio no longer exists: never send the old key back (the database refuses it)
  const { data: { user } } = await supabase.auth.getUser();
  return unwrap(await supabase.from('profiles').update(clean).eq('id', user.id).select().single());
}

/** theme keys: bg_color, text_color, link_color, accent_color, border_color, bg_image, bg_repeat, font, cursor */
export const updateTheme = (theme) => updateMyProfile({ theme });

/** Phone theme override: only bg_image and font_size may differ (the accent stays shared).
 *  {} = fall back to the desktop theme. Validated server-side by is_valid_phone_theme. */
export const updateMyPhoneTheme = (phoneTheme) => updateMyProfile({ phone_theme: cleanPhoneTheme(phoneTheme) });

export async function setAvatar(file) {
  const me = await getMyProfile();
  const path = await uploadImage(file, 'avatar');
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

export async function myViews(id) { return Number(unwrap(await supabase.rpc('profile_view_count', { p_profile: id }))); }

/** Like (on = true) or unlike someone's profile. A profile cannot be liked by its owner. */
export async function setProfileLike(profileId, on) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');
  if (on) unwrap(await supabase.from('profile_likes').insert({ profile_id: profileId, liker_id: user.id }));
  else unwrap(await supabase.from('profile_likes').delete().eq('profile_id', profileId).eq('liker_id', user.id));
}

/** Current like state for one profile (count + did I like it), for a lightweight refetch on window focus. */
export async function getProfileLikeState(profileId) {
  const [s] = unwrap(await supabase.rpc('profile_like_state', { p_profile: profileId })) || [];
  return { count: Number(s?.count || 0), liked: !!s?.liked };
}

/** Who liked this profile, newest first (privacy and blocks are enforced by the database). */
export async function listProfileLikers(profileId) {
  return unwrap(await supabase.rpc('profile_likers', { p_profile: profileId })) || [];
}
