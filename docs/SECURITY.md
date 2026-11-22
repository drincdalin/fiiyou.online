# Security and abuse protection

What protects fiiyou, layer by layer, and what you still switch on yourself. Facts about Vercel and Supabase plans change: check the linked dashboards before relying on a number.

## 1. The database (the part the public key in the website can reach)
The `VITE_SUPABASE_ANON_KEY` in the site is public by design. What it can do is decided only by Postgres.
- **Row level security is on for every table**, with policies per person (friends-only posts, blocked people, messages between two people only). `0033_rls_lockdown.sql` turns it on for any table that lacks it and **removes every table privilege from the signed-out role**, except reading `localities` (place names for sign-up). It also closes every function to signed-out visitors except `email_banned` and `username_available`, which the sign-up screen needs. Tables and functions added later start closed.
- Signed-in people can read other people's profiles (that is what a social network does) but not friends-only posts, other people's messages, other people's notifications, or admin tables, and cannot change someone else's rows or give themselves the verified badge (column privileges). `supabase/tests/` proves each of these.
- **Check your live database yourself:** paste `supabase/audit_rls.sql` into the Supabase SQL editor. It changes nothing and prints `summary | OK` when no table lacks row level security, no view skips it, and nothing unexpected is open to signed-out visitors. Run it after every migration.
- There is no `users` table to protect: accounts live in Supabase's own `auth.users`, which the API never exposes. The `profiles` table is the public part.

## 2. Limits on what one person can do
Database triggers (they work no matter how the request arrives): posts, comments, guestbook entries, messages, friend requests, reports, photos, places, scheduled posts, pins (`0022`, `0029`, earlier), and from `0032` likes (150 an hour) and blocks (30 an hour). The app shows a friendly message when one trips.

## 3. In front of the website (Vercel)
- Vercel absorbs large floods against the site itself (DDoS mitigation is part of the platform).
- `middleware.js` gives one visitor address 240 page requests at once and 4 a second after that (240 a minute), then answers `429`. It only counts page requests, not files. It is per server instance, so it stops one noisy script, not a large distributed attack. Tune with the Vercel variables `RATE_LIMIT_BURST` and `RATE_LIMIT_PER_SECOND`. It lets everything through if it ever fails.
- **Also add a firewall rate-limit rule** in the Vercel dashboard (Project → Firewall → Add rule → Rate limit, per IP, action "Deny" or "Too many requests"). Plans differ in how many rules and rate limits they include: look at the Firewall page. A reasonable start: 300 requests per 60 seconds per IP on all paths.
- Turn on **Attack Challenge Mode** (Firewall page) if you are ever under attack; it is a switch, not code.

## 4. Sign-up and sign-in (Supabase Auth)
- Dashboard → Authentication → Rate Limits: keep the defaults or lower them. Email confirmation must be ON, and use your own SMTP (the built-in sender is meant for testing and is tightly limited).
- **Turnstile CAPTCHA** (free): create a widget in the Cloudflare dashboard, put the site key in Vercel as `VITE_TURNSTILE_SITE_KEY` and redeploy, then paste the secret key in the Supabase dashboard (Authentication settings, the CAPTCHA / bot protection section, provider Cloudflare Turnstile). Do both or neither: if Supabase requires CAPTCHA and the site has no key, nobody can sign in. With no key the check is simply absent. This is the real defence against bots creating accounts, which is also how a stranger would get to read the profile directory.

## 5. Photos, bandwidth, free tier
Storage buckets are private; files are reached by signed links that expire after an hour. The service worker keeps downloaded photos on the device by file path (deleted at sign-out), so scrolling the same feed again does not download them again, which also keeps you well inside the free tier's monthly transfer.

## 6. Secrets
Only the anon key and the Turnstile site key are in the website. The service-role key, `WEBHOOK_SECRET` and the VAPID private key live only in Supabase function secrets. Never put them in a `VITE_` variable: those are published with the site.
