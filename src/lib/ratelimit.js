// Token bucket per visitor (per IP address), kept in memory. Used by /middleware.js in front of the website.
// Each visitor starts with `burst` tokens, every request costs one, and tokens come back at `perSec` a second.
// It is deliberately simple: one server instance counts only the requests it sees, so this slows down a single noisy visitor
// (a script hammering the site from one address); it is NOT a defence against a large distributed attack. That job belongs to
// Vercel's own DDoS protection and the firewall rate-limit rule described in docs/SECURITY.md.

export function createLimiter({ burst = 240, perSec = 4, maxKeys = 5000 } = {}) {
  const buckets = new Map();   // ip -> { tokens, at }
  const sweep = (now) => {
    for (const [k, b] of buckets) if (now - b.at > 120000) buckets.delete(k);          // quiet for two minutes: forgotten
    if (buckets.size > maxKeys) { let n = buckets.size - maxKeys; for (const k of buckets.keys()) { if (n-- <= 0) break; buckets.delete(k); } }   // still too many: oldest first
  };
  return function take(key, now = Date.now()) {
    if (buckets.size > maxKeys) sweep(now);
    const b = buckets.get(key) || { tokens: burst, at: now };
    b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * perSec); b.at = now;
    buckets.delete(key); buckets.set(key, b);   // most recently seen goes last, so eviction drops the longest-idle first
    if (b.tokens >= 1) { b.tokens -= 1; return { ok: true, retry: 0 }; }
    return { ok: false, retry: Math.max(1, Math.ceil((1 - b.tokens) / perSec)) };
  };
}
