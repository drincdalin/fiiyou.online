# Releasing fiiyou (Vercel + Supabase)

The site is a static Vite build hosted on **Vercel**; data, auth and files live in **Supabase**. Setup below is one-time. After that every `git push` to `main` is built and deployed by Vercel, and GitHub Actions (`.github/workflows/ci.yml`) checks that the app builds and the database tests pass.

## 0. Before anything else
- `public/privacy.html` and `public/terms.html` use **contact@fiiyou.online** as the contact address. Make sure that mailbox exists (or forwards to your real inbox) before launch. A legal contact address that bounces is worse than none.
- Add the region your Supabase project runs in to the "Where data is processed" paragraph of `privacy.html` if you want to be specific.
- Have someone you trust read both pages, and update them whenever you change how data is handled.
- Fonts (Ubuntu Sans, woff2) and their licence are already in `public/fonts/`.

## 1. Supabase (production settings)
1. SQL Editor: migrations `0001` to `0023` and `seed.sql` must all have been run, in order, once each. Files `0015`–`0022` were renumbered in git so every file has its own version number; **their SQL is unchanged**. If you already ran them under their old names, the only new file to run is **`0023_media_read_scope.sql`**. Add `lat`/`lng` to your localities (the map skips localities without coordinates; verify the names in the seed while you are there).
2. Authentication → URL Configuration: **Site URL** = `https://fiiyou.online`. **Redirect URLs**: add `https://fiiyou.online` and `https://fiiyou.online/**` (keep `http://localhost:5173` and `http://localhost:5173/**` for local work). Password-reset and confirmation links depend on this.
3. Authentication → Email: turn **Confirm email** on. Set up your **own SMTP provider** before inviting people: Supabase's built-in sender is for testing and is heavily limited.
4. Authentication → Attack protection / password settings: use the strongest options your plan offers. Do **not** enable CAPTCHA yet: the sign-up form does not send a CAPTCHA token, so sign-ups would fail.
5. Advisors → run **Security Advisor** and **Performance Advisor** and read what they say.
6. **Make yourself the administrator** (run once; keep your email out of the repository):
   `insert into public.admin_emails (email) values ('your-admin@email.com');`
   Admin access requires signing in with that exact, **confirmed** email. An "Admin" tab then appears in the app. Use a strong unique password and two-factor authentication if your plan offers it. Verified badges are given from Admin → Users → Verify.
7. Know your plan's limits (storage, database size, backups, pausing of inactive projects) and export your data now and then.

## 2. Vercel
1. Vercel → Add New → Project → import this GitHub repository. Framework preset **Vite**, build command `npm run build`, output directory `dist` (these are the defaults).
2. Settings → Environment Variables (Production, and Preview if you use previews):
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = publishable / anon key (public by design; Row Level Security protects the data). **Never** add a `service_role` or secret key here or anywhere in this repository.
   - `SITE_URL` = `https://fiiyou.online` (https, no trailing slash). It builds `sitemap.xml`, `robots.txt` and the `og:image` tags. **The production build fails without it**, on purpose, so the `YOUR-DOMAIN` placeholder never goes live.
   - `VITE_VAPID_PUBLIC_KEY` = the public VAPID key (only if you set up push, see [PUSH_SETUP.md](PUSH_SETUP.md)).
3. Settings → Domains: add `fiiyou.online`, then create the DNS records Vercel shows at your registrar. HTTPS is automatic.
4. **Turn GitHub Pages off** (repo Settings → Pages → unpublish), so the old site cannot answer for the domain or cause confusion. The old Pages workflow and `CNAME` files were removed from the repo.
5. Redeploy once after setting the variables (Deployments → ⋯ → Redeploy). Security headers (`frame-ancestors`, HSTS, `nosniff`, referrer and permissions policies) come from `vercel.json`.

## 3. Search engines
- `robots.txt` and `sitemap.xml` are generated at build time from `SITE_URL`. Only the landing page, privacy and terms are public (everything else needs a login), so those three URLs are all there is to index.
- Add the site in Google Search Console and submit `https://fiiyou.online/sitemap.xml`.
- Share the link in a chat app to check the preview card (`public/og-image.png`).

## 4. Final checklist (do it on your phone too)
- [ ] Sign up with a fresh email, confirm it, sign in.
- [ ] "Forgot your password?" email arrives, the link opens the app on the new-password form, and saving works.
- [ ] Customize → Save, upload an avatar, add a photo, add a place from search, post, comment, like.
- [ ] Two accounts: friend request, accept, chat, report a post, block. After blocking, the blocked account can no longer load your photos.
- [ ] A **friends-only** post with an image: a friend sees the image, a non-friend account does not.
- [ ] Open `https://fiiyou.online/<some-username>` and `/post/<id>` directly (deep links) and refresh: no 404.
- [ ] Push (if enabled): turn it on, like something from the second account while the first app is in the background, tap the notification: it opens the right post/profile, also when the app was already open.
- [ ] Export all my data, Export my theme, Import a theme.
- [ ] Delete a test account (account menu) and confirm its files disappear from Storage after a while.
- [ ] Open the site with the browser console open: no red errors, no blocked requests.
- [ ] `https://fiiyou.online/sitemap.xml` shows your real domain, not `YOUR-DOMAIN`.

## 5. Moderation (Admin tab)
- **Reports:** every Report button sends an item to Admin → Reports with a preview. You can open the profile, delete the content (a post's image file is deleted too), delete the account (all of its files are removed first), mark it reviewed or dismiss it.
- **Users:** search members, Verify / Unverify, delete an account.
- **Storage:** "Scan for orphans" finds files in storage that nothing references any more and removes them. Deleting rows with SQL never frees storage; this does.
- **Log:** every admin action is recorded.
- Deleting accounts from the Supabase dashboard still works but leaves their files behind; use the Admin tab, or run the storage scan afterwards.

## Updating later
Change code, `git push`, wait for the green CI check and the Vercel deploy. Database changes: add a new numbered migration file (next free number, one file per number), add it to `supabase/tests/run.sh`, run it once in the SQL Editor.
