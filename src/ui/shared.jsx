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

/** Plain text with two extras: @user and #tag become clickable. No markdown is interpreted (*, **, [text](url) etc. stay exactly as typed);
 *  nothing is ever parsed as HTML. Line breaks are kept by the CSS (white-space: pre-wrap). */
export function Rich({ text = '', onUser, onTag }) {
  const out = []; const re = /(?<![\w@])@([A-Za-z0-9_]{2,30})\b|(?<![\p{L}\p{N}_#&/])#([\p{L}\p{N}_]{2,32})/gu; let last = 0, m, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index)); k++;
    if (m[1]) out.push(onUser ? <button key={k} type="button" className="ulink mention" onClick={() => onUser(m[1])}>@{m[1]}</button> : <span key={k} className="mention">@{m[1]}</span>);
    else out.push(/^[\d_]+$/.test(m[2]) ? m[0] : onTag ? <button key={k} type="button" className="tag" onClick={() => onTag(m[2].toLowerCase())}>#{m[2]}</button> : `#${m[2]}`);   // all-digit "#1" stays plain text
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
