# fiiyou

A customizable local social network: profiles you can style (colors, fonts, stickers, safe custom styles, music), photos with captions and likes, a friends map with real places, home feed with events, chat, and strong privacy defaults. React + Vite on the front, Supabase (Postgres, Auth, Storage, Realtime) behind it, hosted as static files on Vercel.

- **Release guide:** [docs/RELEASE.md](docs/RELEASE.md) · **Push notifications:** [docs/PUSH_SETUP.md](docs/PUSH_SETUP.md)
- **Run locally:** `cp .env.example .env`, fill in the Supabase URL and publishable key, `npm i`, `npm run dev`
- **Local Supabase (Docker, no cloud project needed):** `supabase start` builds the stack and applies every migration plus `seed.sql`; put the printed `API_URL` and `ANON_KEY` into `.env`. Studio: http://127.0.0.1:54323, auth emails (confirm / reset): http://127.0.0.1:54324. `supabase db reset` rebuilds the database from scratch; `supabase stop --no-backup` deletes it. Settings live in `supabase/config.toml`.
- **Database:** `supabase/migrations/0001…0029` in order, then `supabase/seed.sql`. Each file needs its own numeric prefix — the CLI records one migration version per number. Tests: `npm run test:db` (needs a local Postgres; it uses a mocked Supabase schema and applies every migration in order, so it also catches numbering mistakes). CI runs it on every push.
- **Fonts:** Ubuntu Sans (variable woff2) and its licence are in `public/fonts/`.
- **Branding:** exact colours and type in [docs/BRANDING.md](docs/BRANDING.md).

## How it is built
- **Privacy:** everything requires login; Row Level Security on every table; blocks hide people from each other; messages are friends-only; profile-view counts never reveal who viewed; the data export covers everything and account deletion removes rows and files.
- **Safety:** profiles store structured style rules, never CSS text; rich text is a tiny markup rendered as plain elements; imports are re-validated field by field and again by the database; a Content-Security-Policy and security headers ship with the production build; files in storage are readable only when there is no block between the two people and, for friends-only posts, only by friends; verified badges and all moderation go through an admin role that the database checks on every call (a confirmed sign-in email in a list clients cannot read), with an audit log.
- **Images:** compressed to WebP in the browser (avatar ~70 KB, photos ~200 KB, backgrounds ~260 KB); replaced files are deleted at once, and a sweep removes any unreferenced leftovers.
- **Third parties:** Supabase (data), Vercel (hosting), OpenStreetMap (map tiles; place search only when you press Search), YouTube nocookie (only after you press play on a YouTube music link). No analytics, no ads.
- **Colour roles:** the signed-in person's accent drives the app; green = success, pink-red = likes, yellow = notices, red = errors.
