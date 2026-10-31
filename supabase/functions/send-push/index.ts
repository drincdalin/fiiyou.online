// Supabase Edge Function `send-push`. Two callers:
//  1. database webhooks (public.notifications and public.messages, event Insert), proven by the x-webhook-secret header:
//     sends a Web Push message to every device the receiving person turned notifications on for.
//  2. the "Send test" button in Settings, proven by the signed-in person's own token: sends one test message to that person's devices.
// Deploy with:  supabase functions deploy send-push --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const env = (k: string) => Deno.env.get(k) ?? '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

// A bad or missing key must not stop the function from starting: it answers every call with a readable reason instead.
let setupError = '';
try { webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY')); }
catch (e) { setupError = (e as Error).message; console.error('VAPID setup failed:', setupError); }

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'content-type': 'application/json' } });

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

/** Sends `payload` to every saved device of `userId`. Devices the push service says are gone (404 / 410) are forgotten. */
async function deliver(userId: string, payload: Record<string, unknown>) {
  const { data: subs, error } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
  if (error) throw new Error(`could not read push_subscriptions: ${error.message}`);
  const out = { devices: subs?.length ?? 0, sent: 0, failed: 0, errors: [] as string[] };
  if (!subs?.length) return out;
  const body = JSON.stringify(payload);
  const dead: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 86400, urgency: 'high' });
      out.sent++;
    } catch (e) {
      out.failed++;
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.id);   // the device removed the subscription: forget it
      // 400 / 401 / 403 usually mean the device subscribed with a different VAPID key than the one in the secrets
      else { console.error('push failed', code, (e as Error).message, (e as { body?: string }).body ?? ''); out.errors.push(String(code ?? 'network')); }
    }
  }));
  if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const isHook = !!env('WEBHOOK_SECRET') && req.headers.get('x-webhook-secret') === env('WEBHOOK_SECRET');
  let body: { test?: boolean; type?: string; table?: string; record?: Record<string, string | null> };
  try { body = await req.json(); } catch { return json({ error: 'bad request' }, 400); }

  try {
    if (!isHook) {
      // not our webhook: the only other thing allowed is a signed-in person testing their own devices
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data } = token ? await admin.auth.getUser(token) : { data: { user: null } };
      if (body.test !== true || !data?.user) return json({ error: 'forbidden' }, 403);
      if (setupError) return json({ error: `Push keys are not set up on the server (${setupError}). Check the VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT secrets.` }, 500);
      return json(await deliver(data.user.id, { title: 'fiiyou', body: 'Push notifications are working on this device.', path: '', tag: 'test', force: true }));
    }

    if (setupError) { console.error('refusing to send:', setupError); return json({ error: setupError }, 500); }
    const n = body.record;
    if (body.type !== 'INSERT') return json({ ok: 'ignored' });

    // Two webhooks feed this function: public.notifications (likes, comments, ...) and public.messages (chat).
    // A chat message is not a row in notifications (the Chat icon shows its own unread count), so it has its own branch.
    const isMessage = body.table === 'messages';
    const receiver = isMessage ? n?.recipient_id : n?.user_id;
    const actorId = isMessage ? n?.sender_id : n?.actor_id;
    if (!receiver || !actorId) return json({ ok: 'ignored' });

    const [actor, owner] = await Promise.all([
      admin.from('profiles').select('username, display_name').eq('id', actorId).maybeSingle(),
      !isMessage && OWN_PROFILE.has(n?.type ?? '') ? admin.from('profiles').select('username').eq('id', receiver).maybeSingle() : Promise.resolve({ data: null }),
    ]);

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
    const r = await deliver(receiver, { title: 'fiiyou', body: `${name} ${text}`, path, tag });
    console.log(`push ${body.table}/${n?.type ?? 'message'} -> ${r.devices} device(s), ${r.sent} sent, ${r.failed} failed`);
    return json(r);
  } catch (e) {
    console.error('send-push error:', (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
