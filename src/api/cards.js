import { supabase, unwrap } from '../lib/client.js';

/** Card types: about | text | image | gallery | links | interests | music | top_friends | guestbook
 *  content shapes (plain data, never HTML):
 *    about/text -> {body}            gallery -> {images:[path]}   image -> {images:[path]}
 *    links -> {links:[{label,url}]}  music -> {url}               interests -> {interests:[str]}
 *  style: bg_color, text_color, border_color, border_style, border_width(0-8), shadow
 */
export const CARD_TYPES = ['about', 'text', 'image', 'gallery', 'links', 'interests', 'music', 'top_friends', 'guestbook'];

export async function createCard(card) {
  const { data: { user } } = await supabase.auth.getUser();
  return unwrap(await supabase.from('profile_cards')
    .insert({ content: {}, style: {}, ...card, profile_id: user.id }).select().single());
}

export async function updateCard(id, patch) {
  const allowed = ['title', 'content', 'style', 'x', 'y', 'w', 'h', 'z', 'rotation', 'visible'];
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
  return unwrap(await supabase.from('profile_cards').update(clean).eq('id', id).select().single());
}

export async function deleteCard(cardOrId) {
  const id = typeof cardOrId === 'string' ? cardOrId : cardOrId.id; const files = typeof cardOrId === 'object' ? cardOrId.content?.images || [] : [];
  unwrap(await supabase.from('profile_cards').delete().eq('id', id));
  if (files.length) supabase.storage.from('media').remove(files).catch(() => {});   // free the storage too
}

/** layout = [{id, x, y, w, h, z, rotation}] — call on drag/resize end (debounce it). */
export async function saveLayout(layout) {
  unwrap(await supabase.rpc('save_card_layout', { p_layout: layout }));
}

export async function listMine() {
  const { data: { user } } = await supabase.auth.getUser();
  return unwrap(await supabase.from('profile_cards').select('*').eq('profile_id', user.id).order('y'));
}
