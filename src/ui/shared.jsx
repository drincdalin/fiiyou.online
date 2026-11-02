import { useEffect, useMemo, useState } from 'react';
import { media } from '../index.js';

/** Seeded synchronously from the URL cache and merged (never reset to {}), so avatars/images don't blink while a refetch runs. */
export function useImages(paths) {
  const k = paths.filter(Boolean).join('|');
  const [fetched, setFetched] = useState({});
  const cached = useMemo(() => media.peekSignedUrls(paths), [k]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!k) return undefined; let live = true;
    media.signedUrls(paths).then((r) => live && setFetched((o) => ({ ...o, ...r }))).catch(() => {});
    return () => { live = false; };
  }, [k]);   // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => ({ ...cached, ...fetched }), [cached, fetched]);
}

const initialsOf = (n = '') => (n.trim().split(/\s+/).slice(0, 2).map((w) => Array.from(w)[0] || '').join('') || '?').toUpperCase();
const hueOf = (n = '') => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

/** Never an empty circle: initials while there is no URL, while it loads, or if it fails.
 *  A new URL (signed-URL refresh) is preloaded off-screen and swapped in only once decoded, so the old picture stays visible. */
export const Avatar = ({ src, size = 40, name = '' }) => {
  const [shown, setShown] = useState(null); const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!src || src === shown) return undefined;
    let live = true; const im = new Image(); im.decoding = 'async';
    im.onload = () => { if (live) { setShown(src); setFailed(false); } };
    im.onerror = () => { if (live) setFailed(true); };
    im.src = src; return () => { live = false; };
  }, [src]);   // eslint-disable-line react-hooks/exhaustive-deps
  const ok = shown && !failed;
  return (<span className={`av${ok ? '' : ' av--ini'}`} style={{ width: size, height: size, '--avh': hueOf(name), fontSize: Math.max(10, Math.round(size * 0.4)) }}>
    {ok ? <img src={shown} alt="" decoding="async" draggable="false" onError={() => { setShown(null); setFailed(true); }} />
      : <span className="ini" aria-hidden="true">{initialsOf(name)}</span>}</span>);
};

/* ---------- skeletons ---------- */
export const Sk = ({ w, h = 12, r = 8, style, className = '' }) => <span className={`sk ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
export const PostSkeleton = ({ image = true }) => (
  <article className="post sk-post" aria-hidden="true">
    <header><span className="sk-row"><Sk w={40} h={40} r={999} /><span className="sk-col"><Sk w={120} h={12} /><Sk w={80} h={10} /></span></span></header>
    {image && <Sk className="sk-img" h={260} r={18} style={{ width: '100%', display: 'block' }} />}
    <div className="sk-col" style={{ padding: '10px 0' }}><Sk w="92%" /><Sk w="68%" /></div>
    <footer className="sk-row"><Sk w={52} h={28} r={999} /><Sk w={52} h={28} r={999} /></footer>
  </article>);
export const FeedSkeleton = ({ n = 3 }) => <div role="status" aria-label="Loading posts">{Array.from({ length: n }, (_, i) => <PostSkeleton key={i} image={i % 2 === 0} />)}</div>;
export const ListSkeleton = ({ n = 4 }) => (<div role="status" aria-label="Loading">{Array.from({ length: n }, (_, i) => (
  <div className="row sk-row" key={i} aria-hidden="true"><Sk w={44} h={44} r={999} /><span className="sk-col"><Sk w={130} /><Sk w={90} h={10} /></span></div>))}</div>);
export const SnapshotSkeleton = () => (<aside className="snap panel" role="status" aria-label="Loading">
  <div className="sk-row"><Sk w={64} h={64} r={999} /><span className="sk-col"><Sk w={110} /><Sk w={80} h={10} /></span></div>
  <div className="stats3"><Sk h={52} r={12} /><Sk h={52} r={12} /><Sk h={52} r={12} /></div><Sk h={40} r={12} style={{ width: '100%', display: 'block' }} /></aside>);
export const Boot = () => <div className="boot" role="status" aria-label="Loading"><ListSkeleton n={3} /></div>;
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
