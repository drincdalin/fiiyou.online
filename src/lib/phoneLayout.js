// Phone-only profile data: normalisers that mirror the database validators in 0054
// (is_valid_phone_layout / is_valid_phone_theme). Like cardGeometry, values are pulled
// back inside the allowed range rather than rejected, so a stray value never fails the
// whole save. Keep the ranges in sync with supabase/migrations/0054_phone_profile.sql.

const FLOW_ORDER = [0, 79];
const SIZE = [40, 2000];
const OFFSET = [-30000, 30000];
const SCALE = [0.2, 5];
const FONT_SIZES = ['13', '14', '15', '16', '18'];
// lowercase only, exactly like the database regex in 0054 (is_valid_phone_layout): a
// canonical uuid is lowercase, and an uppercase one would fail the CHECK on save.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MEDIA_PATH_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,80}$/;

const clamp = (v, [lo, hi], dp = 0) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const c = Math.min(hi, Math.max(lo, n));
  return dp === 0 ? Math.round(c) : Math.round(c * 10 ** dp) / 10 ** dp;
};

/** Normalise a per-card phone layout into the exact shape the DB accepts. {} = fall back to desktop.
 *  Flow cards: { order, visible, w, h }. Stickers: { pin:{card,v}, y, scale, visible }. */
export function cleanPhoneLayout(card, raw) {
  if (!card || !raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  if (typeof raw.visible === 'boolean') out.visible = raw.visible;
  if (card.type === 'sticker') {
    const p = raw.pin;
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      const c = p.card === null ? null : (typeof p.card === 'string' && UUID_RE.test(p.card) ? p.card : undefined);
      const v = p.v === 'b' ? 'b' : p.v === 't' ? 't' : undefined;
      if (c !== undefined && v) out.pin = { card: c, v };
    }
    const y = clamp(raw.y, OFFSET); if (y !== null) out.y = y;
    const s = clamp(raw.scale, SCALE, 2); if (s !== null) out.scale = s;
  } else {
    const o = clamp(raw.order, FLOW_ORDER); if (o !== null) out.order = o;
    const w = clamp(raw.w, SIZE); if (w !== null) out.w = w;
    const h = clamp(raw.h, SIZE); if (h !== null) out.h = h;
  }
  return out;
}

/** Normalise a phone theme override into { bg_image, font_size } (the accent is shared and
 *  cannot be overridden). {} = fall back to the desktop theme. */
export function cleanPhoneTheme(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  if (typeof raw.bg_image === 'string' && MEDIA_PATH_RE.test(raw.bg_image)) out.bg_image = raw.bg_image;
  if (typeof raw.font_size === 'string' && FONT_SIZES.includes(raw.font_size)) out.font_size = raw.font_size;
  return out;
}
