import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// Cloudflare Turnstile (a free, privacy-friendly CAPTCHA) in front of sign up, sign in and password reset, so bots cannot create accounts or
// guess passwords in bulk. Optional: with no VITE_TURNSTILE_SITE_KEY nothing is shown and nothing is loaded. Setup: docs/SECURITY.md.
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
export const CAPTCHA_ON = !!SITE_KEY;

let loading = null;
const loadScript = () => loading || (loading = new Promise((ok, no) => {
  if (window.turnstile) return ok(window.turnstile);
  const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true;
  s.onload = () => ok(window.turnstile); s.onerror = () => { loading = null; no(new Error('captcha_blocked')); }; document.head.appendChild(s);
}));

/** onToken(token) gets the one-time token (or '' when it expired / failed). A token works once: call ref.reset() after every attempt. */
const Captcha = forwardRef(function Captcha({ onToken, onProblem }, ref) {
  const box = useRef(null); const wid = useRef(null); const cb = useRef(onToken); cb.current = onToken; const bad = useRef(onProblem); bad.current = onProblem;
  useImperativeHandle(ref, () => ({ reset() { cb.current(''); if (wid.current != null) { try { window.turnstile?.reset(wid.current); } catch { /* ignore */ } } } }), []);
  useEffect(() => {
    if (!CAPTCHA_ON) return undefined; let dead = false;
    loadScript().then((t) => {
      if (dead || !box.current || !t) return;
      wid.current = t.render(box.current, { sitekey: SITE_KEY, theme: 'auto', callback: (tok) => cb.current(tok), 'expired-callback': () => cb.current(''), 'error-callback': () => { cb.current(''); bad.current?.(); } });
    }).catch(() => bad.current?.());   // blocked by an ad blocker / offline: the form says so instead of waiting forever
    return () => { dead = true; if (wid.current != null) { try { window.turnstile?.remove(wid.current); } catch { /* ignore */ } wid.current = null; } };
  }, []);
  return CAPTCHA_ON ? <div ref={box} className="captcha" role="group" aria-label="Security check" /> : null;
});
export default Captcha;
