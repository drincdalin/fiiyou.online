import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, CaretDown, MagnifyingGlass, Check, X } from '@phosphor-icons/react';

// A searchable replacement for the long <select> of localities.
//   <LocalityPicker locs={locs} value={loc} onChange={(id) => setLoc(id)} emptyLabel="All localities" ariaLabel="Place" />
//   value: '' | id (number or string).  onChange gets the id as a STRING, or '' for "no locality" (same as the old <select>'s e.target.value).
// - type to filter (ignores accents: "pocioveliste" finds Pocioveliște; also finds villages by their commune: "curatele")
// - empty search shows: "no locality" choice, your own place (pinnedIds), then the places you picked recently
// - keyboard: Arrow keys, Enter, Escape; screen readers get a combobox + listbox
// - the list is drawn on <body> (position: fixed), so no card / panel with overflow: hidden can cut it off
import { norm, readRecent, writeRecent, searchLocalities } from '../lib/localitySearch.js';

export default function LocalityPicker({ locs, value, onChange, emptyLabel = 'Anywhere', ariaLabel = 'Locality', pinnedIds = [], disabled = false, className = '' }) {
  const uid = useId(); const listId = `${uid}-list`;
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [active, setActive] = useState(0); const [pos, setPos] = useState(null);
  const btn = useRef(null); const pop = useRef(null); const inp = useRef(null);
  const list = useMemo(() => locs.map((l) => ({ ...l, _n: norm(l.name), _c: norm(l.commune) })), [locs]);
  const current = value !== '' && value != null ? list.find((l) => String(l.id) === String(value)) : null;
  const recent = useMemo(() => (open ? readRecent() : []), [open]);
  const res = useMemo(() => searchLocalities(list, q, { pinnedIds, recentIds: recent, emptyLabel }), [list, q, pinnedIds.join(','), recent, emptyLabel]);   // eslint-disable-line react-hooks/exhaustive-deps
  const pickable = useMemo(() => res.rows.map((r, i) => [r, i]).filter(([r]) => r.kind !== 'group'), [res]);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect(); if (!r) return;
    const vw = window.innerWidth, vh = window.innerHeight, w = Math.min(Math.max(r.width, 280), 360, vw - 16);
    const below = vh - r.bottom - 12, above = r.top - 12, up = below < 240 && above > below;
    setPos({ left: Math.max(8, Math.min(r.left, vw - w - 8)), width: w, [up ? 'bottom' : 'top']: up ? vh - r.top + 6 : r.bottom + 6, maxList: Math.max(140, Math.min(340, (up ? above : below) - 64)) });
  }, []);
  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (!pop.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false); };
    const move = () => place();
    document.addEventListener('pointerdown', down); window.addEventListener('resize', move); window.addEventListener('scroll', move, true);
    return () => { document.removeEventListener('pointerdown', down); window.removeEventListener('resize', move); window.removeEventListener('scroll', move, true); };
  }, [open, place]);
  useEffect(() => { if (open) { setQ(''); setActive(0); setTimeout(() => inp.current?.focus(), 0); } }, [open]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { document.getElementById(`${uid}-o${active}`)?.scrollIntoView?.({ block: 'nearest' }); }, [active, uid]);

  const choose = (row) => { if (row.kind === 'loc') { writeRecent(row.l.id); onChange(String(row.l.id)); } else onChange(''); setOpen(false); btn.current?.focus(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(pickable.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const p = pickable[active]; if (p) choose(p[0]); }
    else if (e.key === 'Tab') setOpen(false);
  };
  const hint = (l) => (l.commune && !/\(/.test(l.name) && norm(l.commune) !== norm(l.name) ? l.commune : '') + (l.county ? `${l.commune && !/\(/.test(l.name) && norm(l.commune) !== norm(l.name) ? ' · ' : ''}${l.county.replace(/ county$/i, '')}` : '');

  return (<>
    <button ref={btn} type="button" className={`locpick${current ? ' has' : ''} ${className}`} disabled={disabled} aria-label={`${ariaLabel}: ${current ? current.name : emptyLabel}`}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setOpen((o) => !o)}>
      <MapPin size={15} weight="bold" aria-hidden="true" /><span className="lpv">{current ? current.name : (value ? '…' : emptyLabel)}</span><CaretDown size={13} weight="bold" aria-hidden="true" />
    </button>
    {open && pos && createPortal(
      <div ref={pop} className="lppop" style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }} onKeyDown={onKey}>
        <div className="lpsearch"><MagnifyingGlass size={15} weight="bold" aria-hidden="true" />
          <input ref={inp} type="search" role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={pickable[active] ? `${uid}-o${pickable[active][1]}` : undefined} aria-label={`Search ${locs.length} places`}
            placeholder={`Search ${locs.length.toLocaleString('en')} places…`} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="go" />
          {q && <button type="button" className="lpclear" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(''); inp.current?.focus(); }}><X size={12} weight="bold" aria-hidden="true" /></button>}</div>
        <ul id={listId} role="listbox" className="lplist" style={{ maxHeight: pos.maxList }}>
          {res.rows.map((r, i) => r.kind === 'group' ? <li key={`g${i}`} role="presentation" className="lpgroup">{r.label}</li> : (
            <li key={r.kind === 'empty' ? 'empty' : r.l.id} id={`${uid}-o${i}`} role="option" aria-selected={r.kind === 'empty' ? !current : String(r.l.id) === String(value)}
              className={`lpopt${pickable[active]?.[1] === i ? ' act' : ''}`} onMouseMove={() => { const k = pickable.findIndex(([, j]) => j === i); if (k >= 0 && k !== active) setActive(k); }} onClick={() => choose(r)}>
              {r.kind === 'empty' ? <span className="lpn">{r.label}</span> : <><span className="lpn">{r.l.name}</span>{hint(r.l) && <small>{hint(r.l)}</small>}</>}
              {(r.kind === 'empty' ? !current : String(r.l.id) === String(value)) && <Check size={14} weight="bold" aria-hidden="true" />}
            </li>))}
          {!q && <li role="presentation" className="lphelp">{locs.length ? `Start typing a village, town or commune. ${locs.length.toLocaleString('en')} places.` : 'Loading places…'}</li>}
          {q && !res.rows.length && <li role="presentation" className="lphelp">No place called “{q}”. Check the spelling, or try the commune name.</li>}
          {res.more > 0 && q && <li role="presentation" className="lphelp">{res.more} more. Type a few more letters.</li>}
        </ul>
        <div className="sronly" role="status" aria-live="polite">{q ? `${res.total} places found` : ''}</div>
      </div>, document.body)}
  </>);
}
