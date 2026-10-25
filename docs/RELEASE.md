# Releasing fiiyou on GitHub Pages

Everything below is a one-time setup. After that, every `git push` to `main` rebuilds and deploys the site.

## 0. Fill in the placeholders (5 minutes)
Search the project for `[` placeholders in `public/privacy.html` and `public/terms.html`:
`[YOUR FULL NAME]`, `[CITY, COUNTRY]`, `[CONTACT EMAIL]`, `[DATE]`, `[COUNTRY]`.
These pages are a plain-language template that matches what the app really does. Have someone you trust read them, and update them if you change how data is handled.
Put the Ubuntu Sans font files in `public/fonts/` (see the README.txt there) together with the font's licence file. Ubuntu Sans is an open-source family, but include the licence text that comes with your download.

## 1. Supabase (production settings)
1. SQL Editor: make sure migrations `0001` to `0015` and `seed.sql` have all been run (in order, once each). Add `lat`/`lng` to your localities.
2. Authentication → URL Configuration: set **Site URL** to your final address (for example `https://fiiyou.online`) and add the same address to **Redirect URLs** (keep `http://localhost:5173` there too for local work). Password-reset and confirmation links depend on this.
3. Authentication → Email: turn **Confirm email** back on. Set up your **own SMTP provider** before inviting people: Supabase's built-in email sender is meant for testing and is heavily limited (it may only deliver to your own team's addresses). Check Supabase's current docs for the exact limits.
4. Authentication → Attack protection / password settings: use the strongest options your plan offers. Do **not** enable CAPTCHA yet: the sign-up form does not send a CAPTCHA token, so sign-ups would fail.
5. Advisors → run **Security Advisor** and **Performance Advisor** and read what they say.
6. **Make yourself the administrator** (run once; keep your email out of the repository):
   `insert into public.admin_emails (email) values ('your-admin@email.com');`
   Admin access requires signing in with that exact, **confirmed** email, so keep "Confirm email" on. An "Admin" tab then appears in the app. Turn on two-factor authentication for that account if your Supabase plan offers it, and use a strong, unique password.
   Verified badges (for the primărie, for you, for anyone) are given from Admin → Users → Verify; nobody can give themselves one.
7. Know your plan's limits (storage, database size, backups, pausing of inactive projects) and export your data now and then.

## 2. GitHub repository
1. Push the code to your repository (`main` branch).
2. Settings → Secrets and variables → Actions → **Secrets** → New repository secret:
   `VITE_SUPABASE_URL` (Project URL) and `VITE_SUPABASE_ANON_KEY` (the publishable / anon key). These two are public by design; your data is protected by Row Level Security, never by hiding the key. **Never** add a `service_role` or secret key anywhere in this project.
3. Same page → **Variables** → New repository variable:
   - `SITE_URL` = your final address with `https://` and no trailing slash. It builds the sitemap, robots.txt and canonical tags.
   - `CUSTOM_DOMAIN` = `fiiyou.online` (only if you use a custom domain).
   - `VITE_BASE` = `/<repo-name>/` (only if you publish at `https://<user>.github.io/<repo-name>/` WITHOUT a custom domain; leave it unset otherwise).
4. Settings → Pages → **Build and deployment → Source: GitHub Actions**.
5. Push a commit (or Actions → "Deploy to GitHub Pages" → Run workflow). When it turns green, your site is live.

## 3. Custom domain (optional but recommended)
1. At your domain registrar, add the DNS records GitHub documents for Pages ("Managing a custom domain for your GitHub Pages site"): for an apex domain the A/AAAA records GitHub lists, for a subdomain a CNAME to `<user>.github.io`.
2. Settings → Pages → Custom domain: enter the domain, wait for the DNS check, then tick **Enforce HTTPS**.
3. Put the same domain in Supabase Site URL / Redirect URLs (step 1.2) and in the `SITE_URL` / `CUSTOM_DOMAIN` variables.

## 4. Search engines
- `robots.txt` and `sitemap.xml` are generated at build time from `SITE_URL`. Because every page except the landing page, privacy and terms sits behind a login, those three URLs are all there is to index. That is intentional.
- Add the site in Google Search Console and submit `https://<your-domain>/sitemap.xml`.

## 5. Final checklist (do it on your phone too)
- [ ] Sign up with a fresh email, confirm it, sign in.
- [ ] "Forgot your password?" email arrives and the reset form works.
- [ ] Customize → Save, upload an avatar, add a photo, add a place from search, post, comment, like.
- [ ] Two accounts: friend request, accept, chat, report a post, block.
- [ ] Export all my data, Export my theme, Import a theme.
- [ ] Delete a test account (account menu) and confirm its files disappear from Storage after a while.
- [ ] Open the site with the browser console open: no red errors, no blocked requests.

## 6. Moderation (Admin tab)
- **Reports:** every Report button sends an item to Admin → Reports with a preview. You can open the profile, delete the content (a post's image file is deleted too), delete the account (all of its files are removed first), mark it reviewed or dismiss it.
- **Users:** search members, Verify / Unverify, delete an account.
- **Storage:** "Scan for orphans" finds files in storage that nothing references any more (for example from accounts deleted in the dashboard) and removes them. Deleting rows with SQL never frees storage; this does.
- **Log:** every admin action is recorded.
- Deleting accounts from the Supabase dashboard still works, but leaves their files behind; use the Admin tab, or run the storage scan afterwards.

## Updating later
Change code, `git push`, wait for the green check. Database changes: add a new numbered migration file and run it once in the SQL Editor.
