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
