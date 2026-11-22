import { supabase, unwrap, PROFILE_PUBLIC } from '../lib/client.js';

export const sendRequest   = async (userId) => unwrap(await supabase.rpc('send_friend_request', { p_target: userId }));
export const acceptRequest = async (requestId) => unwrap(await supabase.rpc('respond_friend_request', { p_request: requestId, p_accept: true }));
export const declineRequest = async (requestId) => unwrap(await supabase.rpc('respond_friend_request', { p_request: requestId, p_accept: false }));
/** unfriend, or cancel an outgoing request */
export const removeFriend  = async (userId) => unwrap(await supabase.rpc('remove_friend', { p_other: userId }));

export async function listFriends() {
  const { data: { user } } = await supabase.auth.getUser();
  return unwrap(await supabase.rpc('friends_of', { p_profile: user.id }));
}
export const friendsOf = async (profileId) => unwrap(await supabase.rpc('friends_of', { p_profile: profileId }));

export async function incomingRequests() {
  const { data: { user } } = await supabase.auth.getUser();
  return unwrap(await supabase.from('friendships')
    .select(`id, created_at, from:profiles!friendships_requester_id_fkey(${PROFILE_PUBLIC})`)
    .eq('addressee_id', user.id).eq('status', 'pending').order('created_at', { ascending: false }));
}
export async function outgoingRequests() {
  const { data: { user } } = await supabase.auth.getUser();
  return unwrap(await supabase.from('friendships')
    .select(`id, created_at, to:profiles!friendships_addressee_id_fkey(${PROFILE_PUBLIC})`)
    .eq('requester_id', user.id).eq('status', 'pending').order('created_at', { ascending: false }));
}

/** Order of the array = rank (max 8). Must all be accepted friends. */
export const setTopFriends = async (friendIds) => unwrap(await supabase.rpc('set_top_friends', { p_friend_ids: friendIds }));

/** Realtime: fires when someone sends you a request. Needs `friendships` added to the realtime publication. */
export function onIncomingRequest(myId, cb) {
  const ch = supabase.channel('friend-requests')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${myId}` }, cb)
    .subscribe();
  return () => supabase.removeChannel(ch);
}
