# Push notifications setup (optional)

Push is off until all of this is done; Settings shows "not set up" without `VITE_VAPID_PUBLIC_KEY`.
How it works: a row is inserted into `public.notifications` (by database triggers) → a Supabase **database webhook** calls the Edge Function `send-push` → it sends a Web Push message to every device that person turned notifications on for (`public.push_subscriptions`).

## 1. Generate a VAPID key pair (once)
```
npx web-push generate-vapid-keys
```
Keep the **private** key secret. The **public** key goes to the website.

## 2. Edge Function
Needs the [Supabase CLI](https://supabase.com/docs/guides/cli), logged in and linked to your project (`supabase login`, `supabase link --project-ref <ref>`).
```
supabase secrets set VAPID_PUBLIC_KEY=<public key> VAPID_PRIVATE_KEY=<private key> VAPID_SUBJECT=mailto:contact@fiiyou.online WEBHOOK_SECRET=<a long random string>
supabase functions deploy send-push --no-verify-jwt
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions automatically. The service role key must **never** be put in this repository or in Vercel.
`--no-verify-jwt` is intended: the function is only reachable with the `x-webhook-secret` header and refuses everything else with 403.

## 3. Database webhooks (two of them: notifications AND messages)
**Easiest:** open `supabase/push_webhooks.sql`, fill in your project reference and the same `WEBHOOK_SECRET`, run it in the SQL editor. It creates both webhooks, so the chat one cannot be forgotten.

By hand instead (Dashboard → Database → Webhooks → Create), twice:
- Table `public.notifications`, event **Insert**; and table `public.messages`, event **Insert** (chat messages are not rows in `notifications`)
- Type: Supabase Edge Function → `send-push` (or HTTP Request to the function's URL), method POST
- HTTP header `x-webhook-secret` = the same `WEBHOOK_SECRET` as above

## 4. Website
Vercel → Environment Variables → `VITE_VAPID_PUBLIC_KEY` = the public key → redeploy.

## 5. Check it, from your own computer
These two calls use the same `WEBHOOK_SECRET`, so only you can run them. Replace `<ref>` and `<secret>`.
```
# Is the function there, are its keys valid, does its public key match the website's, how many devices are saved?
curl -s -X POST https://<ref>.supabase.co/functions/v1/send-push -H "x-webhook-secret: <secret>" -H "content-type: application/json" -d '{"type":"DIAG"}'

# Send one notification to every device a person turned on (get the user id from Dashboard -> Authentication -> Users)
curl -s -X POST https://<ref>.supabase.co/functions/v1/send-push -H "x-webhook-secret: <secret>" -H "content-type: application/json" -d '{"type":"TEST","user_id":"<uuid>"}'
```
- `DIAG` shows `"vapid":"ok"` and a `vapid_public_key`. That key must be **identical** to `VITE_VAPID_PUBLIC_KEY` in Vercel. `saved_devices` is how many devices have notifications turned on.
- `TEST` answers `{"devices":1,"sent":1,"failed":0}` when it worked. `"failed"` with an error code means the push service refused it: 401 / 403 = the keys differ between the website and the function; 404 / 410 = the device was removed (turn notifications off and on again).
- Anyone can open `https://<ref>.supabase.co/functions/v1/send-push` in a browser: `{"ok":true,"push":"ready"}` means deployed and configured. The app's Settings page reads the same thing and says so when it is not ready.

Then the real thing: sign in on a phone, Settings → Push notifications → Turn on, and **close the app or switch to another tab** (while the app is open and in front, no system notification is shown on purpose: the in-app bell and the chat badge do that). From a second account, like a post or send a message. Tapping the notification opens that post or chat.
iPhone: the site must be added to the Home Screen first (Share → Add to Home Screen) and opened from there.
Logs: Dashboard → Edge Functions → `send-push` → Logs. Expired devices (404/410) are removed automatically.

## Troubleshooting: "it says not set up" / "nothing arrives"
Work through this in order, the first failing step is the problem.
1. **Open `https://<ref>.supabase.co/functions/v1/send-push` in a browser.** `{"ok":true,"push":"ready"}`: go on. Not found / `Invalid JWT`: the function is not deployed, or deployed without `--no-verify-jwt` (step 2). `"misconfigured"`: run `DIAG`, the VAPID keys or subject are wrong (the subject must start with `mailto:` or `https://`).
2. **Settings says push is "not available".** The build has no `VITE_VAPID_PUBLIC_KEY` (step 4). Add the variable in Vercel and **redeploy** (Vite bakes it in at build time; changing it without a redeploy does nothing).
3. **The item says "Notifications are blocked".** The browser permission is "block" for this site; allow it in the browser / OS site settings.
4. **On iPhone only a hint shows.** Add the site to the Home Screen and open it from there (iOS 16.4+).
5. **Turned on, `DIAG` is fine, `TEST` arrives, but real likes / messages do not.** The webhooks are missing or have the wrong secret: run `supabase/push_webhooks.sql`. Check Dashboard → Edge Functions → `send-push` → Logs after liking something: a 403 means the secret differs, no log line at all means the webhook never fires.
6. **It arrives only when the app is closed.** That is intended (see step 5 above).
Notification kinds covered: likes, comments, wall comments, replies, comment likes, @mentions, friend requests, chat messages. Redeploy the function after pulling these changes: `supabase functions deploy send-push --no-verify-jwt`.

## What a notification looks like
Title = who did it ("Paul"), text = what they did ("liked your post"), the round picture = their profile picture, and for likes and comments on a post or photo the photo itself is shown under the text. Chat notifications show the sender's name and picture but never the message text. The pictures are one-hour links made by the function with the service-role key (the same `SUPABASE_SERVICE_ROLE_KEY` secret; nothing new to set). If a picture cannot be made the notification still arrives with the fiiyou icon. Opening the app removes its notifications from the phone's notification shade, and on an installed app the unread count is shown on the app icon. Redeploy the function after updating: `supabase functions deploy send-push --no-verify-jwt`.
