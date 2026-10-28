// Supabase Edge Function `send-push`: called by a database webhook whenever a row is inserted into public.notifications.
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
};

Deno.serve(async (req) => {
  // only our own database webhook knows this secret (set the same value in the webhook's HTTP headers)
  if (!env('WEBHOOK_SECRET') || req.headers.get('x-webhook-secret') !== env('WEBHOOK_SECRET')) return new Response('forbidden', { status: 403 });

  let body: { type?: string; record?: Record<string, string | null> };
  try { body = await req.json(); } catch { return new Response('bad request', { status: 400 }); }
  const n = body.record;
  if (body.type !== 'INSERT' || !n?.user_id) return new Response('ignored');

  const [actor, subs] = await Promise.all([
    admin.from('profiles').select('username, display_name').eq('id', n.actor_id).maybeSingle(),
    admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', n.user_id),
  ]);
  if (!subs.data?.length) return new Response('no devices');

  const name = actor.data?.display_name || actor.data?.username || 'Someone';
  // path is relative to the app's address (no leading slash): the service worker resolves it against its own scope
  const username = actor.data?.username ? encodeURIComponent(actor.data.username.toLowerCase()) : '';
  const path = n.post_id ? `post/${n.post_id}` : username;
  const payload = JSON.stringify({
    title: 'fiiyou',
    body: `${name} ${TEXT[n.type ?? ''] ?? 'sent you something'}`,
    path,
    tag: `${n.type}:${n.post_id ?? n.photo_id ?? n.actor_id}`,
  });

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
