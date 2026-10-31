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

## 3. Database webhook
Supabase Dashboard → Database → Webhooks → Create:
- Table: `public.notifications`, event: **Insert**
- Type: Supabase Edge Function → `send-push` (or HTTP Request to the function's URL), method POST
- HTTP header: `x-webhook-secret` = the same `WEBHOOK_SECRET` as above

## 4. Website
Vercel → Environment Variables → `VITE_VAPID_PUBLIC_KEY` = the public key → redeploy.

## 5. Test
Sign in on a phone or desktop browser, account menu → Settings → Push notifications → Turn on. From a second account, like a post of the first. With the first app in the background you get a notification; tapping it opens `/post/<id>` (or the person's profile for friend requests). In the foreground no system notification is shown (the in-app badge already does that).
iPhone: the site must be added to the Home Screen first (Share → Add to Home Screen), then opened from there.
Logs: Dashboard → Edge Functions → `send-push` → Logs. Expired devices (404/410) are removed automatically.

## Troubleshooting: "it says not set up" / "nothing arrives"
Work through this in order, the first failing step is the problem.
1. **Settings says push is "not set up on this server".** The build has no `VITE_VAPID_PUBLIC_KEY` (step 4). Add the variable in Vercel and **redeploy** (Vite bakes it in at build time; changing it without a redeploy does nothing).
2. **The item says "Notifications are blocked".** The browser permission is "block" for this site; allow it in the browser / OS site settings.
3. **On iPhone only a hint shows.** Add the site to the Home Screen and open it from there (iOS 16.4+).
4. **You turned it on but nothing arrives.** Dashboard → Database → Webhooks: is there one for `notifications` / Insert with the `x-webhook-secret` header? Dashboard → Edge Functions → `send-push` → Logs: a 403 means the secret differs, no log line at all means the webhook never fires, "no devices" means the device was not saved (turn it off and on again).
5. **It arrives only when the app is closed.** That is intended: while the app is open and in front, the in-app badge is used instead.
Notification kinds covered since 0029: likes, comments, wall comments, replies, comment likes, @mentions, friend requests. Redeploy the function after pulling these changes: `supabase functions deploy send-push --no-verify-jwt`.

