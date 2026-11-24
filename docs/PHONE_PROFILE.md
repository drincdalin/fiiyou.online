# Phone profile (per-device customisation)

A profile is drawn two ways: **desktop** (free-position canvas, sidebar next to the cards)
and **phone** (the sidebar stacks on top and the cards flow in a single column, stickers
pinned to their card). Today the phone render is derived from the desktop data. This feature
lets the owner tailor the phone render **independently**, without touching what desktop visitors
see.

Contract, schema and API only. No UI in this phase.

## What is stored per device

Two new, optional, default-empty columns (see `supabase/migrations/0054_phone_profile.sql`):

### `profile_cards.phone_layout` (jsonb, default `{}`)

Per card, the phone presentation:

- **Flow cards** (everything except `sticker`): `order` (position in the phone flow, 0–79),
  `visible` (shown on phone), `w` / `h` (size in units, 40–2000).
- **Stickers**: `pin` (`{ card: <card id | null>, v: "t" | "b" }` — which card the sticker
  hangs from, and which edge), `y` (vertical offset from that edge, in units, −30000…30000),
  `scale` (size multiplier, 0.2–5), `visible`.

An empty object means "fall back to desktop": cards keep the desktop flow order, visibility
and size; stickers keep their desktop pin. **A profile with no phone layout renders on a phone
exactly as it does today.**

### `profiles.phone_theme` (jsonb, default `{}`)

Only two keys may differ on a phone, and nothing else:

- `bg_image` — a different background image (a portrait crop of the wide desktop image, or a
  mobile-friendly one). The desktop background is usually a wide image that crops badly on a
  phone.
- `font_size` — the base text size (one of the same `13`–`18` values the desktop theme uses),
  so a text-heavy profile can shrink to fit a small screen.

The **accent colour is shared** — it is the person's identity colour (buttons, chat bubbles,
borders) and must not change per device. Everything else (colours, layout, fonts, radius, …)
is also shared: on a phone the layout is always stacked, so `layout`/`sidebar`/`card_gap`
have no meaning there. Custom CSS rules are applied to both devices identically in this phase;
a per-device CSS override is a separate column if it is ever needed.

## Who can write

Only the owner, enforced twice:

- **Row Level Security** — the existing row policies cover the new columns
  (`profiles_update_own` and `cards_update_own` both require `id`/`profile_id = auth.uid()`);
  a column-level grant is added for `phone_theme` because `profiles` updates are column-gated.
- **The database validates every write** — `phone_layout` is checked by
  `is_valid_phone_layout(type, phone_layout)` and `phone_theme` by `is_valid_phone_theme()`;
  both enforce the exact shape and ranges above (object shape, allowed keys, max card order,
  max size/offset/scale). A client-side normaliser (`src/lib/phoneLayout.js`) keeps the common
  case from ever failing a save, but it is not the trust boundary.

## Failure

On a rejected value the database raises a `CHECK` violation and the API throws; the client
surfaces it through the existing `errorCode()` as `invalid_value` (or `forbidden` for an RLS
rejection). The UI may show a plain string ("That value is not allowed" / "You can only edit
your own profile").

## Default / backwards compatibility

Both columns are `not null default '{}'`, so this migration is a **no-op for existing users**:
nothing changes on any device until the owner edits their phone layout or phone theme.

## Share

The phone share export will render from the phone layout when it is present (falling back to
the desktop data otherwise). Implemented in a later phase.
