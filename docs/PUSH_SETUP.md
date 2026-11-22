# Push notifications setup (optional)

Push is off until all of this is done; Settings shows "not set up" without `VITE_VAPID_PUBLIC_KEY`.
How it works: a row is inserted into `public.notifications` (by database triggers) → a Supabase **database webhook** calls the Edge Function `send-push` → it sends a Web Push message to every device that person turned notifications on for (`public.push_subscriptions`).

## 1. Generate a VAPID key pair (once)
```
npx web-push generate-vapid-keys
```
Keep the **private** key secret. The **public** key goes to the website.

## 2. Edge Function
On the self-hosted stack the function files live in `/srv/fiiyou/supabase/volumes/functions/send-push/`, and its secrets are read from `/srv/fiiyou/supabase/.env`.
```
# in /srv/fiiyou/supabase/.env
VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:contact@fiiyou.online
WEBHOOK_SECRET=<a long random string>
```
```
cd /srv/fiiyou/supabase
docker compose up -d --force-recreate --no-deps functions
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the stack itself. The service role key must **never** be put in this repository or in Vercel.
`FUNCTIONS_VERIFY_JWT=false` is intended: the function is only reachable with the `x-webhook-secret` header and refuses everything else with 403.

## 3. Database webhooks (two of them: notifications AND messages)
**Easiest:** open `supabase/push_webhooks.sql`, fill in the same `WEBHOOK_SECRET`, and run it against the database (`docker exec -i supabase-db psql -U postgres -d postgres`). It creates both triggers, so the chat one cannot be forgotten. The URL is already the stack's internal gateway, so it does not depend on the public tunnel.

By hand instead, create two triggers with the helper function above:
- `public.notifications`, event **Insert**; and `public.messages`, event **Insert** (chat messages are not rows in `notifications`)
- `execute function public.fiiyou_call_edge('http://api-gw:8000/functions/v1/send-push', '<secret>', 'full')`
- The helper sends the `x-webhook-secret` header for you; the secret must equal `WEBHOOK_SECRET` in `.env`

## 4. Website
Vercel → Environment Variables → `VITE_VAPID_PUBLIC_KEY` = the public key → redeploy.

## 5. Check it, from your own computer
These two calls use the same `WEBHOOK_SECRET`, so only you can run them. Replace `<secret>`.
```
# Is the function there, are its keys valid, does its public key match the website's, how many devices are saved?
curl -s -X POST https://api.fiiyou.online/functions/v1/send-push -H "x-webhook-secret: <secret>" -H "content-type: application/json" -d '{"type":"DIAG"}'

# Send one notification to every device a person turned on (get the user id with: select id, email from auth.users;)
curl -s -X POST https://api.fiiyou.online/functions/v1/send-push -H "x-webhook-secret: <secret>" -H "content-type: application/json" -d '{"type":"TEST","user_id":"<uuid>"}'
```
- `DIAG` shows `"vapid":"ok"` and a `vapid_public_key`. That key must be **identical** to `VITE_VAPID_PUBLIC_KEY` in Vercel. `saved_devices` is how many devices have notifications turned on.
- `TEST` answers `{"devices":1,"sent":1,"failed":0}` when it worked. `"failed"` with an error code means the push service refused it: 401 / 403 = the keys differ between the website and the function; 404 / 410 = the device was removed (turn notifications off and on again).
- Anyone can open `https://api.fiiyou.online/functions/v1/send-push` in a browser: `{"ok":true,"push":"ready"}` means deployed and configured. The app's Settings page reads the same thing and says so when it is not ready.

Then the real thing: sign in on a phone, Settings → Push notifications → Turn on, and **close the app or switch to another tab** (while the app is open and in front, no system notification is shown on purpose: the in-app bell and the chat badge do that). From a second account, like a post or send a message. Tapping the notification opens that post or chat.
iPhone: the site must be added to the Home Screen first (Share → Add to Home Screen) and opened from there.
Logs: `cd /srv/fiiyou/supabase && docker compose logs -f functions`. Expired devices (404/410) are removed automatically.

## Troubleshooting: "it says not set up" / "nothing arrives"
Work through this in order, the first failing step is the problem.
1. **Open `https://api.fiiyou.online/functions/v1/send-push` in a browser.** `{"ok":true,"push":"ready"}`: go on. Not found / `Invalid JWT`: the function is not mounted, or `FUNCTIONS_VERIFY_JWT` is not `false` (step 2). `"misconfigured"`: run `DIAG`, the VAPID keys or subject are wrong (the subject must start with `mailto:` or `https://`).
2. **Settings says push is "not available".** The build has no `VITE_VAPID_PUBLIC_KEY` (step 4). Add the variable in Vercel and **redeploy** (Vite bakes it in at build time; changing it without a redeploy does nothing).
3. **The item says "Notifications are blocked".** The browser permission is "block" for this site; allow it in the browser / OS site settings.
4. **On iPhone only a hint shows.** Add the site to the Home Screen and open it from there (iOS 16.4+).
5. **Turned on, `DIAG` is fine, `TEST` arrives, but real likes / messages do not.** The webhooks are missing or have the wrong secret: run `supabase/push_webhooks.sql`. Check `docker compose logs -f functions` after liking something: a 403 means the secret differs, no log line at all means the webhook never fires.
6. **It arrives only when the app is closed.** That is intended (see step 5 above).
Notification kinds covered: likes, comments, wall comments, replies, comment likes, @mentions, friend requests, chat messages. Recreate the function after pulling these changes: `docker compose up -d --force-recreate --no-deps functions`.

## What a notification looks like
Title = who did it ("Paul"), text = what they did ("liked your post"), the round picture = their profile picture, and for likes and comments on a post or photo the photo itself is shown under the text. Chat notifications show the sender's name and picture but never the message text. The pictures are one-hour links made by the function with the service-role key (the same `SUPABASE_SERVICE_ROLE_KEY` secret; nothing new to set). If a picture cannot be made the notification still arrives with the fiiyou icon. Opening the app removes its notifications from the phone's notification shade, and on an installed app the unread count is shown on the app icon. Recreate the function after updating: `docker compose up -d --force-recreate --no-deps functions`.

**Picture shows a grey circle with a letter?** That is what Chrome draws when it cannot download a notification's picture. The service worker therefore downloads the picture itself (and keeps it, one download per person) and puts it into the notification; if even that fails you get the fiiyou icon instead. The `TEST` call above now shows the person's own picture, so you can check it without a second account.
