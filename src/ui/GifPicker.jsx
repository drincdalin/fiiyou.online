import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { searchGifs } from '../lib/gifs.js';
import './gif.css';

const SUGGESTIONS = ['hello', 'thank you', 'love', 'lol', 'wow', 'yes', 'no', 'good morning'];

/** Columns in the results grid, read live from the rendered grid so arrow-key
 *  navigation follows the visual layout at every breakpoint. */
const gridColumns = (el) => {
  if (!el) return 2;
  const tracks = getComputedStyle(el).gridTemplateColumns;
  const n = tracks.split(' ').filter(Boolean).length;
  return n > 0 ? n : 2;
};

/** Keyless GIF search (GifJif). Selecting a tile hands the GIF back to the caller and closes. */
export default function GifPicker({ onPick, onClose }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [active, setActive] = useState(-1);   // roving tabindex: which tile is the single tab stop
  const [attempt, setAttempt] = useState(0);  // bumped to retry after an error
  const panel = useRef(null);
  const search = useRef(null);
  const grid = useRef(null);
  const tiles = useRef([]);
  const seq = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus: search input on open, Tab stays inside, Escape closes, focus returns to what opened it.
  useEffect(() => {
    const el = panel.current;
    if (!el) return undefined;
    const opener = document.activeElement;
    search.current?.focus({ preventScroll: true });
    const key = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); return; }
      if (e.key !== 'Tab') return;
      const f = [...el.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((n) => n.offsetParent !== null);
      if (!f.length) { e.preventDefault(); return; }
      const a = document.activeElement;
      if (e.shiftKey && (a === f[0] || a === el)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    el.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('keydown', key);
      if (opener && document.contains(opener)) opener.focus?.({ preventScroll: true });
    };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search. An empty query resets to the first-open state.
  // useLayoutEffect: the "loading" flip happens before paint, so a fresh query never flashes "No GIFs found".
  useLayoutEffect(() => {
    const text = q.trim();
    if (!text) { seq.current++; setItems([]); setErr(''); setLoading(false); setActive(-1); return undefined; }
    const id = ++seq.current;
    const ctl = new AbortController();
    setLoading(true); setErr(''); setActive(-1);
    const t = setTimeout(async () => {
      try {
        const list = await searchGifs(text, { signal: ctl.signal });
        if (seq.current === id) { setItems(list); setActive(list.length ? 0 : -1); }
      } catch (e) {
        if (e.name !== 'AbortError' && seq.current === id) { setErr(e.message || 'Could not load GIFs.'); setItems([]); setActive(-1); }
      } finally {
        if (seq.current === id) setLoading(false);
      }
    }, 300);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, attempt]);

  const moveTo = (i) => { setActive(i); tiles.current[i]?.focus(); };

  const onGridKey = (e) => {
    const n = items.length;
    if (!n) return;
    const cols = gridColumns(grid.current);
    let next = active;
    if (e.key === 'ArrowRight') next = Math.min(n - 1, active + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, active - 1);
    else if (e.key === 'ArrowDown') next = Math.min(n - 1, active + cols);
    else if (e.key === 'ArrowUp') next = Math.max(0, active - cols);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else return;
    e.preventDefault();
    moveTo(next);
  };

  const onInputKey = (e) => {
    if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || !items.length) return;
    e.preventDefault();
    moveTo(e.key === 'ArrowDown' ? 0 : items.length - 1);
  };

  const pick = (g) => { onPick(g); onClose(); };

  const state = !q.trim() ? 'idle' : err ? 'error' : loading ? 'loading' : items.length ? 'results' : 'empty';

  return createPortal(
    <div className="gifmodal" onMouseDown={(e) => { if (e.target === e.currentTarget) onCloseRef.current(); }}>
      <div className="gifpanel" ref={panel} role="dialog" aria-modal="true" aria-labelledby="gif-picker-title">
        <div className="gifhead">
          <h2 className="giftitle" id="gif-picker-title">GIFs</h2>
          <button type="button" className="gifclose" aria-label="Close GIF picker" title="Close" onClick={() => onCloseRef.current()}><X size={18} weight="bold" aria-hidden="true" /></button>
        </div>
        <label className="gifsearch">
          <MagnifyingGlass size={17} weight="bold" aria-hidden="true" />
          <input ref={search} type="search" value={q} maxLength={80} placeholder="Search GIFs" aria-label="Search GIFs" autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search" onChange={(e) => setQ(e.target.value)} onKeyDown={onInputKey} />
          {q && <button type="button" aria-label="Clear GIF search" onClick={() => { setQ(''); search.current?.focus(); }}><X size={14} weight="bold" aria-hidden="true" /></button>}
        </label>
        <div className="gifscroll" aria-busy={loading || undefined}>
          {state === 'idle' && (
            <div className="gifstart">
              <p className="giflead">Find a reaction</p>
              <p>Start with a mood, a film, or something you want to say.</p>
              <div className="gifchips">{SUGGESTIONS.map((w) => <button key={w} type="button" onClick={() => setQ(w)}>{w}</button>)}</div>
            </div>
          )}
          {state === 'error' && (
            <div className="gifstate" role="alert">
              <p className="gifstatet">Could not load GIFs.</p>
              <p className="gifstateh">{err}</p>
              <button type="button" className="primary" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
            </div>
          )}
          {state === 'loading' && (
            <div className="gifgrid" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <span key={i} className="gifskel" />)}</div>
          )}
          {state === 'empty' && (
            <div className="gifstate"><p className="gifstatet">No GIFs found.</p><p className="gifstateh">Try a different word.</p></div>
          )}
          {state === 'results' && (
            <div className="gifgrid" ref={grid} role="group" aria-label="GIF results" onKeyDown={onGridKey}>
              {items.map((g, i) => (
                <button key={g.id} type="button" className="giftile" tabIndex={i === active ? 0 : -1} aria-label={g.title} title={g.title}
                  ref={(el) => { if (el) tiles.current[i] = el; }}
                  onClick={() => pick(g)}>
                  <img src={g.url} alt={g.title} width={g.width} height={g.height} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                </button>))}
            </div>
          )}
        </div>
        <div className="giffoot"><span>GIF search by</span> <a href="https://gifjif.com" target="_blank" rel="noreferrer">GifJif</a></div>
      </div>
    </div>,
    document.body,
  );
}
