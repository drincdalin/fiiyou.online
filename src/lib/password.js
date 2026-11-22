// A small, honest password meter. It only looks at length, variety and a few obvious patterns; it cannot know whether a password
// leaked somewhere else, so the labels say "weak / fair / good / strong" and never "safe". The form still only REQUIRES 8 characters.
const COMMON = ['password', 'parola', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'iloveyou', 'abcd1234', '11111111', '00000000', 'fiiyou'];

/** -> { score: 0..4, label, hint }. score 0 = unusable (too short or a well-known password). */
export function passwordStrength(pw, { username = '', email = '' } = {}) {
  const p = String(pw || '');
  if (!p) return { score: 0, label: '', hint: '' };
  if (p.length < 8) return { score: 0, label: 'Too short', hint: `${8 - p.length} more character${8 - p.length === 1 ? '' : 's'} needed` };
  const low = p.toLowerCase();
  const own = [username, String(email).split('@')[0]].map((x) => String(x).toLowerCase()).filter((x) => x.length >= 3);
  if (COMMON.some((c) => low.includes(c)) && p.length < 14) return { score: 0, label: 'Too common', hint: 'Avoid well-known passwords' };
  if (own.some((x) => low.includes(x))) return { score: 1, label: 'Weak', hint: 'Do not use your username or email' };
  let pts = 0;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  pts += p.length >= 12 ? 2 : p.length >= 10 ? 1 : 0;
  pts += p.length >= 16 ? 1 : 0;
  pts += classes >= 3 ? 1 : 0;
  if (new Set(p).size <= 3) pts = 0;                       // aaaaaaaa, abababab
  if (/^(.{1,3})\1+$/.test(p)) pts = 0;                    // short block repeated
  if (/^(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer)/i.test(p) && p.length < 12) pts = Math.min(pts, 0);
  const score = Math.max(1, Math.min(4, 1 + pts));
  return { score, label: ['', 'Weak', 'Fair', 'Good', 'Strong'][score], hint: score < 3 ? 'A longer password, or a few random words, is better' : '' };
}
