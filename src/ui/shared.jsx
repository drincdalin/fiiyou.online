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
