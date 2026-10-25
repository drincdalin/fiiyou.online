# fiiyou

A customizable local social network: profiles you can style (colors, fonts, stickers, safe custom styles, music), photos with captions and likes, a friends map with real places, home feed with events, chat, and strong privacy defaults. React + Vite on the front, Supabase (Postgres, Auth, Storage, Realtime) behind it, hosted as static files on GitHub Pages.

- **Release guide:** [docs/RELEASE.md](docs/RELEASE.md)
- **Run locally:** `cp .env.example .env`, fill in the Supabase URL and publishable key, `npm i`, `npm run dev`
- **Database:** `supabase/migrations/0001…0015` in order, then `supabase/seed.sql`. Tests: `npm run test:db` (needs a local Postgres; it uses a mocked Supabase schema).
- **Fonts:** Ubuntu Sans variable files go in `public/fonts/` (see the README.txt there). Missing files fall back to system fonts.
- **Branding:** exact colours and type in [docs/BRANDING.md](docs/BRANDING.md).

## How it is built
- **Privacy:** everything requires login; Row Level Security on every table; blocks hide people from each other; messages are friends-only; profile-view counts never reveal who viewed; the data export covers everything and account deletion removes rows and files.
- **Safety:** profiles store structured style rules, never CSS text; rich text is a tiny markup rendered as plain elements; imports are re-validated field by field and again by the database; a Content-Security-Policy ships with the production build; verified badges and all moderation go through an admin role that the database checks on every call (a confirmed sign-in email in a list clients cannot read), with an audit log.
- **Images:** compressed to WebP in the browser (avatar ~70 KB, photos ~200 KB, backgrounds ~260 KB); replaced files are deleted at once, and a sweep removes any unreferenced leftovers.
- **Third parties:** Supabase (data), GitHub Pages (hosting), OpenStreetMap (map tiles; place search only when you press Search), YouTube nocookie (only after you press play on a YouTube music link). No analytics, no ads.
- **Colour roles:** the signed-in person's accent drives the app; green = success, pink-red = likes, yellow = notices, red = errors.
