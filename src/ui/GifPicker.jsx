import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { searchGifs } from '../lib/gifs.js';
import './gif.css';

/** Keyless GIF search (GifJif). Selecting a tile hands the GIF back to the caller and closes. */
export default function GifPicker({ onPick, onClose }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const search = useRef(null);
  const seq = useRef(0);

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k);
    requestAnimationFrame(() => search.current?.focus());
    return () => removeEventListener('keydown', k);
  }, [onClose]);

  useEffect(() => {
    const text = q.trim();
    if (!text) { seq.current++; setItems([]); setErr(''); setLoading(false); return undefined; }
    const id = ++seq.current;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true); setErr('');
      try {
        const list = await searchGifs(text, { signal: ctl.signal });
        if (seq.current === id) setItems(list);
      } catch (e) {
        if (e.name !== 'AbortError' && seq.current === id) { setErr(e.message || 'Could not load GIFs.'); setItems([]); }
      } finally {
        if (seq.current === id) setLoading(false);
      }
    }, 320);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  return createPortal(
    <div className="gifmodal" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gifpanel" role="dialog" aria-modal="true" aria-label="Choose a GIF">
        <div className="gifhead">
          <b>GIFs</b>
          <button type="button" className="gifclose" aria-label="Close GIF picker" title="Close" onClick={onClose}><X size={18} weight="bold" aria-hidden="true" /></button>
        </div>
        <label className="gifsearch">
          <MagnifyingGlass size={17} weight="bold" aria-hidden="true" />
          <input ref={search} type="search" value={q} maxLength={80} placeholder="Search GIFs" aria-label="Search GIFs" autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search" onChange={(e) => setQ(e.target.value)} />
          {q && <button type="button" aria-label="Clear GIF search" onClick={() => { setQ(''); search.current?.focus(); }}><X size={14} weight="bold" aria-hidden="true" /></button>}
        </label>
        <div className="gifscroll" aria-busy={loading || undefined}>
          {!q.trim() && !err ? <div className="gifstart">
            <p className="giflead">Find a reaction</p>
            <p>Start with a mood, a film, or something you want to say.</p>
            <div className="gifchips">{['hello', 'thank you', 'love', 'lol', 'wow', 'yes', 'no', 'good morning'].map((w) => <button key={w} type="button" onClick={() => setQ(w)}>{w}</button>)}</div>
          </div>
            : err ? <div className="gifmsg" role="alert">{err}</div>
              : items.length ? <div className="gifgrid">{items.map((g) => (
                <button key={g.id} type="button" className="giftile" aria-label={g.title} title={g.title} onClick={() => { onPick(g); onClose(); }}>
                  <img src={g.url} alt={g.title} width={g.width} height={g.height} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                </button>))}</div>
                : loading ? <div className="gifgrid" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <span key={i} className="gifskel" />)}</div>
                  : <div className="gifmsg">No GIFs found for that.</div>}
        </div>
        <div className="giffoot"><span>GIF search by</span> <a href="https://gifjif.com" target="_blank" rel="noreferrer">GifJif</a></div>
      </div>
    </div>,
    document.body,
  );
}
