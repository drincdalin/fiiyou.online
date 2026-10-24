# fiiyou — backend + first UI

Supabase (Postgres + Auth + Storage) with all logic in SQL/RLS, plus a thin JS API layer for the React frontend.

## Run it (steps)
1. Supabase project -> SQL editor: run `supabase/migrations/0001` … `0006` in order, then `supabase/seed.sql`. (Already ran 0001-0004? Just run 0005.)
2. Set lat/lng on `localities` rows. Auth settings: decide on email confirmation.
3. `cp .env.example .env`, fill URL + anon key.
4. Put your font at `public/fonts/Endless.ttf` (rename the file, or edit the `@font-face` line in `src/ui/styles.css`). Check it has ă â î ș ț.
5. `npm i && npm run dev`. Sign up, hit Customize on your profile.
6. Music card needs a direct https .mp3 URL you host. Nothing loads until play is pressed.
7. Deploy: `npm run build`, upload `dist/` to any static host.

## Backend notes
1. Create a Supabase project.
2. SQL editor: run `supabase/migrations/0001` → `0004` in order, then `supabase/seed.sql`.
3. Fill `lat`/`lng` on the `localities` rows (map skips rows without coords). Edit/add villages freely.
4. Auth settings: decide whether email confirmation is on. If on, `signUp` returns no session until the email link is clicked.
5. Optional realtime for friend-request notifications: Database → Replication → add `friendships`.
6. `cp .env.example .env`, fill URL + anon key, `npm i`.

## Frontend usage
```js
import { auth, profiles, cards, friends, wall, posts, discover, media, safety } from './src/index.js';
const { profile, cards: cardList, topFriends, relationship } = await profiles.getFullProfile('alice');
const urls = await media.signedUrls(cardList.flatMap(c => c.content.images ?? []));   // images are private
```
Errors from `rpc`/inserts carry stable codes via `errorCode(err)` (`rate_limit`, `invalid_value`, `forbidden`, ...).

## What exists
| Area | How |
|---|---|
| Accounts | Supabase auth; trigger makes profile + 4 starter cards; `username_available()` for signup |
| Profile | headline, bio, locality, avatar, `show_on_map`, `wall_policy` (everyone/friends/nobody), structured `theme` |
| Customization | `theme` (colors, font, cursor, bg image) + free-position cards (x,y,w,h,z,rotation,style). 9 card types. `save_card_layout()` saves a drag session atomically. Max 30 cards. |
| Friends | request / accept / decline / cancel / unfriend, mutual request auto-accepts, Top 8, `friends_of()` to browse someone's friends |
| Discovery | `discover_profiles` (random or newest, no ranking), `search_profiles` |
| Local feed | `local_feed()` strictly newest-first; kinds `status`/`event`/`ask`; public or friends-only; comments; `upcomingEvents()` |
| Guestbook | per-profile wall, owner can delete anything on it |
| Map | `friends_map()` — accepted friends who opted in, at locality coords (never exact) |
| Safety | block (severs friendship, hides both ways everywhere), reports (write-only for users), rate limits on posts/comments/requests |
| Privacy | everything needs login; `export_my_data()`; `deleteAccount()` wipes files + cascades rows |
| Images | private bucket, client-side webp compression, 1.5 MB cap, 80 files/user, signed URLs |

## Decisions you may want to flip
- **No raw CSS.** Themes/card styles are whitelisted keys only (the 2000s "paste any CSS" feature is an XSS hole). Easy to extend the lists in `is_valid_theme` / `is_valid_card_style`; fonts are an allowlist.
- **Card content is data, never HTML.** Render as text; links are http(s)-only (checked in DB); music cards store a URL, so allowlist embed hosts in the UI.
- **No likes/algorithm.** Feed is chronological, discovery is random/new.
- **Map is opt-in and friends-only.**

## Not handled yet
- Deleting a post/card does not delete its image from storage (only account deletion cleans up).
- Moderation is the Supabase dashboard (`reports` table, service role). No admin UI.
- No notifications beyond the optional realtime hook, no DMs.

## Tests
`supabase/tests/run.sh` (run as the postgres user on a local Postgres) rebuilds a scratch DB with a mocked `auth`/`storage` schema, applies the migrations and runs 63 checks (RLS, friend flow, blocks, validators, rate limits, anon lockout, cascade delete).
Caveat: that's vanilla Postgres 16, not a real Supabase stack — the `auth.users` trigger and the `storage.objects` policies are the parts most worth re-checking on the real thing. The JS layer is syntax-checked only, not run against a live project.
