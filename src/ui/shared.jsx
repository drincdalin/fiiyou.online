import { useEffect, useState } from 'react';
import { media } from '../index.js';

export function useImages(paths) {
  const [m, setM] = useState({}); const k = paths.filter(Boolean).join('|');
  useEffect(() => { if (k) media.signedUrls(paths).then(setM).catch(() => {}); else setM({}); }, [k]);
  return m;
}
export const Boot = () => <div className="boot">…</div>;
export const Avatar = ({ src, size = 40 }) => <span className="av" style={{ width: size, height: size }}>{src ? <img src={src} alt="" /> : <i />}</span>;
export const ago = (iso) => { const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'now'; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`; return new Date(iso).toLocaleDateString('ro-RO'); };

/** Tiny safe markup: **bold**, *italic*, [text](https://link), @user, #tag. Everything else is plain text; nothing is ever parsed as HTML. */
export function Rich({ text = '', onUser, onTag }) {
  const out = []; const re = /\*\*([^*]{1,300})\*\*|\*([^*]{1,300})\*|\[([^\]]{1,80})\]\((https?:\/\/[^\s)]{1,300})\)|(?<![\w@])@([A-Za-z0-9_]{2,30})\b|(?<![\p{L}\p{N}_#&/])#([\p{L}\p{N}_]{2,32})/gu; let last = 0, m, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index)); k++;
    if (m[1]) out.push(<b key={k}>{m[1]}</b>); else if (m[2]) out.push(<em key={k} className="it">{m[2]}</em>);
    else if (m[5]) out.push(onUser ? <button key={k} type="button" className="ulink mention" onClick={() => onUser(m[5])}>@{m[5]}</button> : <span key={k} className="mention">@{m[5]}</span>);
    else if (m[6]) out.push(/^[\d_]+$/.test(m[6]) ? m[0] : onTag ? <button key={k} type="button" className="tag" onClick={() => onTag(m[6].toLowerCase())}>#{m[6]}</button> : `#${m[6]}`);   // all-digit "#1" stays plain text
    else out.push(<a key={k} href={m[4]} target="_blank" rel="noopener noreferrer nofollow ugc">{m[3]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
