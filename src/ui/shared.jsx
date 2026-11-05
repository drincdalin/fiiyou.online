import { useEffect, useRef, useState } from 'react';
import { media } from '../index.js';

const RETRY = [800, 2500];   // a link that could not be made is tried again after these many ms before the image is called missing
/** paths -> { path: url | null }. undefined = still loading (or being retried), null = could not be made after the retries (file gone or no access). */
export function useImages(paths) {
  const [m, setM] = useState({}); const k = paths.filter(Boolean).join('|');
  useEffect(() => {
    const list = [...new Set(paths.filter(Boolean))];
    if (!list.length) { setM({}); return undefined; }
    let dead = false; const timers = [];
    setM((cur) => Object.fromEntries(list.filter((p) => p in cur && cur[p]).map((p) => [p, cur[p]])));   // keep what is known, drop the rest
    const run = (todo, attempt) => media.signedUrls(todo).catch(() => ({})).then((r) => {
      if (dead) return;
      const miss = todo.filter((p) => !r[p]); const last = attempt >= RETRY.length;
      setM((cur) => { const n = { ...cur }; for (const p of todo) { if (r[p]) n[p] = r[p]; else if (last) n[p] = null; } return n; });
      if (miss.length && !last) timers.push(setTimeout(() => run(miss, attempt + 1), RETRY[attempt]));
    });
    run(list, 0);
    return () => { dead = true; timers.forEach(clearTimeout); };
  }, [k]);   // eslint-disable-line react-hooks/exhaustive-deps
  return m;
}
export const Boot = () => <div className="boot">…</div>;
/** Round picture. When there is no picture (or it fails to load) the first letter of `name` is shown instead of an empty grey circle. */
export function Avatar({ src, size = 40, name = '' }) {
  const [bad, setBad] = useState(false); useEffect(() => { setBad(false); }, [src]);
  const letter = [...String(name).trim()][0]?.toUpperCase();
  return (<span className="av" style={{ width: size, height: size }}>{src && !bad ? <img src={src} alt="" onError={() => setBad(true)} /> : letter ? <b className="avl" style={{ fontSize: Math.round(size * 0.42) }} aria-hidden="true">{letter}</b> : <i />}</span>);
}
export const ago = (iso) => { const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'now'; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`; return new Date(iso).toLocaleDateString('ro-RO'); };

/** Tiny safe markup: **bold**, *italic*, [text](https://link), @user, #tag. Everything else is plain text; nothing is ever parsed as HTML.
 *  plain: skip the bold/italic/link markup and show it as typed (@user and #tag still work). Post bodies use plain; profiles keep the markup. */
const MENTION = String.raw`(?<![\w@])@([A-Za-z0-9_]{2,30})\b`;
const HASHTAG = String.raw`(?<![\p{L}\p{N}_#&/])#([\p{L}\p{N}_]{2,32})`;
const MARKUP_RE = new RegExp(String.raw`\*\*([^*]{1,300})\*\*|\*([^*]{1,300})\*|\[([^\]]{1,80})\]\((https?:\/\/[^\s)]{1,300})\)|${MENTION}|${HASHTAG}`, 'gu');   // groups: 1 bold, 2 italic, 3-4 link, 5 user, 6 tag
const PLAIN_RE = new RegExp(`${MENTION}|${HASHTAG}`, 'gu');                                                                                          // groups: 1 user, 2 tag
export function Rich({ text = '', onUser, onTag, plain = false }) {
  const out = []; const re = plain ? PLAIN_RE : MARKUP_RE; const iu = plain ? 1 : 5, it = plain ? 2 : 6; let last = 0, m, k = 0;
  re.lastIndex = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index)); k++;
    if (!plain && m[1]) out.push(<b key={k}>{m[1]}</b>); else if (!plain && m[2]) out.push(<em key={k} className="it">{m[2]}</em>);
    else if (m[iu]) out.push(onUser ? <button key={k} type="button" className="ulink mention" onClick={() => onUser(m[iu])}>@{m[iu]}</button> : <span key={k} className="mention">@{m[iu]}</span>);
    else if (m[it]) out.push(/^[\d_]+$/.test(m[it]) ? m[0] : onTag ? <button key={k} type="button" className="tag" onClick={() => onTag(m[it].toLowerCase())}>#{m[it]}</button> : `#${m[it]}`);   // all-digit "#1" stays plain text
    else out.push(<a key={k} href={m[4]} target="_blank" rel="noopener noreferrer nofollow ugc">{m[3]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** Full, readable date for tooltips and <time> tags ("12 Oct 2026, 14:05"). */
export const fullDate = (iso) => { try { return new Date(iso).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } };

/** <img> that fades in once it has loaded, so photos never pop in. Cached images show at once. */
export function FadeImg({ className = '', onLoad, ...rest }) {
  const ref = useRef(null); const [ok, setOk] = useState(false);
  useEffect(() => { const el = ref.current; if (el && el.complete && el.naturalWidth) setOk(true); }, [rest.src]);
  return <img ref={ref} className={`fadeimg${ok ? ' ready' : ''}${className ? ` ${className}` : ''}`} onLoad={(e) => { setOk(true); onLoad?.(e); }} onError={() => setOk(true)} {...rest} />;
}

/** True when the visitor asked their system for less motion. */
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Phones: the Back button / swipe-back closes a pop-up instead of leaving the page. Closing it any other way removes the extra history entry again. */
export function useBackToClose(onClose) {
  const cb = useRef(onClose); cb.current = onClose;
  useEffect(() => {
    let popped = false;
    try { history.pushState({ ...(history.state || {}), fiiyouOverlay: true }, ''); } catch { return undefined; }
    const pop = () => { popped = true; cb.current(); };
    addEventListener('popstate', pop);
    return () => { removeEventListener('popstate', pop); if (!popped && history.state?.fiiyouOverlay) history.back(); };
  }, []);
}

/** True on screens you use with a finger (no hover). Lets the chat show a tap menu there instead of hover buttons. */
export function useTouchScreen() {
  const q = '(hover: none)'; const get = () => typeof matchMedia === 'function' && matchMedia(q).matches;
  const [t, setT] = useState(get);
  useEffect(() => { if (typeof matchMedia !== 'function') return undefined; const m = matchMedia(q); const h = () => setT(m.matches); m.addEventListener?.('change', h); return () => m.removeEventListener?.('change', h); }, []);
  return t;
}

/** Swipe a bottom sheet down to close it (touch screens). It follows the finger from anywhere on the sheet as long as the sheet's own
 *  content is scrolled to the top; past a quarter of its height, or on a quick flick, it closes, otherwise it springs back.
 *  Dragging also stops the browser's pull-to-refresh from firing underneath (that was reloading the page behind the sheet). */
export function useSheetDrag(ref, onClose, { enabled = true } = {}) {
  const cb = useRef(onClose); cb.current = onClose;
  useEffect(() => {
    const el = ref.current; if (!el || !enabled) return undefined;
    let x0 = 0; let y0 = 0; let t0 = 0; let dy = 0; let drag = false; let ok = false;
    const scroller = (n) => { for (; n; n = n.parentElement) { if (n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return n; if (n === el) break; } return null; };
    const start = (e) => {
      if (e.touches.length !== 1) { ok = false; return; }
      const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); dy = 0; drag = false;
      const sc = scroller(e.target); ok = (!sc || sc.scrollTop <= 0) && !e.target.closest('input, textarea, select, [contenteditable], [data-nodrag]');
    };
    const move = (e) => {
      if (!ok) return; const t = e.touches[0]; const ddy = t.clientY - y0; const ddx = t.clientX - x0;
      if (!drag) { if (ddy > 8 && ddy > Math.abs(ddx) * 1.2) { drag = true; el.style.transition = 'none'; } else { if (ddy < -4) ok = false; return; } }
      e.preventDefault(); dy = Math.max(0, ddy); el.style.transform = `translateY(${dy}px)`;
    };
    const end = () => {
      if (!drag) return; drag = false;
      const flick = dy / Math.max(1, Date.now() - t0) > 0.6; const far = dy > el.offsetHeight * 0.25;
      el.style.transition = 'transform .2s ease';
      if (far || flick) { el.style.transform = 'translateY(110%)'; setTimeout(() => cb.current(), 170); }
      else { el.style.transform = ''; setTimeout(() => { el.style.transition = ''; }, 220); }
    };
    el.addEventListener('touchstart', start, { passive: true }); el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end); };
  }, [enabled]);   // eslint-disable-line react-hooks/exhaustive-deps
}

/** A modal dialog that behaves: focus moves in, Tab stays inside, Esc closes, focus goes back to what opened it. Give the dialog's root element as `ref`. */
export function useDialog(ref, onClose) {
  const cb = useRef(onClose); cb.current = onClose;
  useEffect(() => {
    const el = ref.current; const opener = document.activeElement; if (!el) return undefined;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    const first = el.querySelector('input:not([type=hidden]), textarea, select, button:not([disabled])'); (first || el).focus({ preventScroll: true });
    const key = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); cb.current(); return; }
      if (e.key !== 'Tab') return;
      const f = [...el.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((n) => n.offsetParent !== null);
      if (!f.length) { e.preventDefault(); return; }
      const a = document.activeElement;
      if (e.shiftKey && (a === f[0] || a === el)) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    el.addEventListener('keydown', key);
    return () => { el.removeEventListener('keydown', key); if (opener && document.contains(opener)) opener.focus?.({ preventScroll: true }); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
}
