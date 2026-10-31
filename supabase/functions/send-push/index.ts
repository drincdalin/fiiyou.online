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
  wall_comment: 'commented on your wall',          // 0025
  comment_like: 'liked your comment',              // 0028 and below
  reply: 'replied to your comment',
  mention: 'mentioned you in a post',
  comment_mention: 'mentioned you in a comment',
};
// these happened on the receiving person's OWN profile, so a tap opens their profile, not the actor's
const OWN_PROFILE = new Set(['wall_comment', 'photo_like']);

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'content-type': 'application/json' } });

/** Test mode, called from the app's account menu by a signed-in person: sends one push to that person's own devices and reports what happened. */
async function selfTest(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data } = await admin.auth.getUser(token);
  if (!data?.user) return json({ error: 'not signed in' }, 401);
  const subs = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', data.user.id);
  const out = { devices: subs.data?.length ?? 0, sent: 0, failed: [] as { code?: number; message: string }[], dead: 0 };
  const payload = JSON.stringify({ title: 'fiiyou', body: 'Test notification. Push works on this device.', path: '', tag: 'test' });
  const dead: string[] = [];
  await Promise.all((subs.data ?? []).map(async (x) => {
    try { await webpush.sendNotification({ endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } }, payload, { TTL: 300 }); out.sent++; }
    catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) dead.push(x.id); out.failed.push({ code, message: String((e as Error).message).slice(0, 160) }); }
  }));
  if (dead.length) { out.dead = dead.length; await admin.from('push_subscriptions').delete().in('id', dead); }
  return json(out);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  // the database webhook proves itself with a shared secret; a signed-in person may only ask for a test to their own devices
  const hook = !!env('WEBHOOK_SECRET') && req.headers.get('x-webhook-secret') === env('WEBHOOK_SECRET');
  if (!hook) { if (req.headers.get('authorization')) return selfTest(req); return new Response('forbidden', { status: 403 }); }

  let body: { type?: string; record?: Record<string, string | null> };
  try { body = await req.json(); } catch { return new Response('bad request', { status: 400 }); }
  const n = body.record;
  if (body.type !== 'INSERT' || !n?.user_id) return new Response('ignored');

  const [actor, subs, owner] = await Promise.all([
    admin.from('profiles').select('username, display_name').eq('id', n.actor_id).maybeSingle(),
    admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', n.user_id),
    OWN_PROFILE.has(n.type ?? '') ? admin.from('profiles').select('username').eq('id', n.user_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!subs.data?.length) return new Response('no devices');

  const name = actor.data?.display_name || actor.data?.username || 'Someone';
  // path is relative to the app's address (no leading slash): the service worker resolves it against its own scope
  const target = OWN_PROFILE.has(n.type ?? '') && owner.data?.username ? owner.data.username : actor.data?.username;
  const username = target ? encodeURIComponent(target.toLowerCase()) : '';
  const path = n.post_id ? `post/${n.post_id}` : username;
  const payload = JSON.stringify({
    title: 'fiiyou',
    body: `${name} ${TEXT[n.type ?? ''] ?? 'sent you something'}`,
    path,
    tag: `${n.type}:${n.post_id ?? n.photo_id ?? n.comment_id ?? n.actor_id}`,
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
