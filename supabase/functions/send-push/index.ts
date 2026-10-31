// Supabase Edge Function `send-push`: called by database webhooks whenever a row is inserted into public.notifications or public.messages.
// It sends a Web Push message to every device the receiving person turned notifications on for.
// Save as supabase/functions/send-push/index.ts and deploy with:  supabase functions deploy send-push --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const env = (k: string) => Deno.env.get(k) ?? '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

const TEXT: Record<string, string> = {
  post_like: 'liked your post',
  photo_like: 'liked your photo',
  comment: 'commented on your post',
  friend_request: 'sent you a friend request',
  friend_accept: 'accepted your friend request',
  wall_comment: 'commented on your wall',          // 0025
  comment_like: 'liked your comment',              // 0028 and below
  reply: 'replied to your comment',
  mention: 'mentioned you in a post',
  comment_mention: 'mentioned you in a comment',
};
// these happened on the receiving person's OWN profile, so a tap opens their profile, not the actor's
const OWN_PROFILE = new Set(['wall_comment', 'photo_like']);

Deno.serve(async (req) => {
  // only our own database webhook knows this secret (set the same value in the webhook's HTTP headers)
  if (!env('WEBHOOK_SECRET') || req.headers.get('x-webhook-secret') !== env('WEBHOOK_SECRET')) return new Response('forbidden', { status: 403 });

  let body: { type?: string; table?: string; record?: Record<string, string | null> };
  try { body = await req.json(); } catch { return new Response('bad request', { status: 400 }); }
  const n = body.record;
  if (body.type !== 'INSERT') return new Response('ignored');

  // Two webhooks feed this function: public.notifications (likes, comments, ...) and public.messages (chat).
  // A chat message is not a row in notifications (the Chat icon shows its own unread count), so it has its own branch.
  const isMessage = body.table === 'messages';
  const receiver = isMessage ? n?.recipient_id : n?.user_id;
  const actorId = isMessage ? n?.sender_id : n?.actor_id;
  if (!receiver || !actorId) return new Response('ignored');

  const [actor, subs, owner] = await Promise.all([
    admin.from('profiles').select('username, display_name').eq('id', actorId).maybeSingle(),
    admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', receiver),
    !isMessage && OWN_PROFILE.has(n?.type ?? '') ? admin.from('profiles').select('username').eq('id', receiver).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!subs.data?.length) return new Response('no devices');

  const name = actor.data?.display_name || actor.data?.username || 'Someone';
  // path is relative to the app's address (no leading slash): the service worker resolves it against its own scope
  let path: string; let text: string; let tag: string;
  if (isMessage) {
    path = `chat/${actorId}`; text = 'sent you a message'; tag = `message:${actorId}`;   // same sender = one notification that updates, not a stack
  } else {
    const target = OWN_PROFILE.has(n?.type ?? '') && owner.data?.username ? owner.data.username : actor.data?.username;
    const username = target ? encodeURIComponent(target.toLowerCase()) : '';
    path = n?.post_id ? `post/${n.post_id}` : username; text = TEXT[n?.type ?? ''] ?? 'sent you something';
    tag = `${n?.type}:${n?.post_id ?? n?.photo_id ?? n?.comment_id ?? n?.actor_id}`;
  }
  const payload = JSON.stringify({ title: 'fiiyou', body: `${name} ${text}`, path, tag });

  const dead: string[] = [];
  await Promise.all(subs.data.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.id);   // the device removed the subscription: forget it
      else console.error('push failed', code, (e as Error).message);
    }
  }));
  if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead);
  return new Response('ok');
});
