# Push notifications setup (optional)

Push is off until all of this is done; the toggle in the account menu stays hidden without `VITE_VAPID_PUBLIC_KEY`.
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
Sign in on a phone or desktop browser, account menu → Turn on push notifications. From a second account, like a post of the first. With the first app in the background you get a notification; tapping it opens `/post/<id>` (or the person's profile for friend requests). In the foreground no system notification is shown (the in-app badge already does that).
iPhone: the site must be added to the Home Screen first (Share → Add to Home Screen), then opened from there.
Logs: Dashboard → Edge Functions → `send-push` → Logs. Expired devices (404/410) are removed automatically.
