/* What an email link leaves in the address bar, read ONCE at start-up (it is the first import in main.jsx, so it runs before supabase-js
 * looks at the address by itself).
 *
 *  1. /auth/confirm?token_hash=...&type=signup   the link our email templates send (supabase/templates/*.html). Nothing is used up by
 *     opening it: the account is only confirmed when the person presses the button on that page (see ConfirmLink in App.jsx). Mail
 *     scanners (Gmail, Outlook Safe Links, antivirus) that "visit" every link therefore cannot burn the one-time token any more.
 *  2. #error=access_denied&error_code=otp_expired...   what Supabase appends when an OLD-style link was already used or has expired.
 *     It used to be ignored, so the person just saw the sign-in page and pressed the link again and again. Now it becomes a message.
 */
const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '');
const TYPES = ['signup', 'recovery', 'magiclink', 'email'];

let confirm = null; let problem = null;

(function read() {
  try {
    const url = new URL(location.href);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const q = url.searchParams;
    const path = url.pathname.slice(BASE.length) || '/';

    if (/^\/auth\/confirm\/?$/.test(path)) {
      const token_hash = q.get('token_hash') || ''; const type = q.get('type') || '';
      if (token_hash && TYPES.includes(type)) confirm = { token_hash, type };
      else problem = { kind: 'invalid' };
      if (!confirm) history.replaceState(null, '', `${BASE}/`);
      return;
    }

    const code = hash.get('error_code') || q.get('error_code') || '';
    const err = hash.get('error') || q.get('error') || '';
    if (code || (err && (hash.has('error_description') || q.has('error_description')))) {
      const desc = hash.get('error_description') || q.get('error_description') || '';
      problem = { kind: code === 'otp_expired' || /expired|invalid|used/i.test(desc) ? 'expired' : 'failed' };
      history.replaceState(null, '', `${BASE}/`);   // also stops supabase-js from reacting to the error by dropping a session that is fine
    }
  } catch { /* an odd address never blocks the app */ }
})();

/** {token_hash, type} when this page was opened from one of our email links, else null. */
export const getConfirmLink = () => confirm;
export function clearConfirmLink() { confirm = null; try { history.replaceState(null, '', `${BASE}/`); } catch { /* ignore */ } }

/** A sentence for the sign-in screen when an old-style link failed, else ''. Call once. */
export function takeLinkError() {
  const p = problem; problem = null;
  if (!p) return '';
  if (p.kind === 'expired') return 'That link has expired or was already used. If you already confirmed your email, just sign in below. If not, sign in and we will offer to send you a new link.';
  if (p.kind === 'invalid') return 'That link is not complete. Open it again from the email, or sign in and we will send you a new one.';
  return 'That link did not work. Sign in below, and if your email is not confirmed yet we will offer to send a new link.';
}
