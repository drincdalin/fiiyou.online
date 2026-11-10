// Every number a card or sticker is saved with must stay inside what the database accepts. A drag, a resize or an old layout can produce a value just
// outside (x = -612, h = NaN, a fraction): that used to fail the whole save with a database error. Values are rounded and pulled back inside, never rejected.
const RANGES = { x: [-500, 5000, 0], y: [-500, 5000, 0], w: [40, 2000, 300], h: [40, 2000, 200], z: [0, 1000, 0] };
const fit = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt; };

/** Returns a copy of `card` (only the keys present are touched) with x, y, w, h, z, rotation made safe to save. */
export function safeGeometry(card) {
  const out = { ...card };
  for (const [k, [lo, hi, dflt]] of Object.entries(RANGES)) if (k in out) out[k] = fit(out[k], lo, hi, dflt);
  if ('rotation' in out) { const r = Number(out.rotation); out.rotation = Number.isFinite(r) ? Math.min(180, Math.max(-180, Math.round(r * 100) / 100)) : 0; }
  return out;
}
