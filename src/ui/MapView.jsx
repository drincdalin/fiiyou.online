import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { posts, social, friends, discover } from '../index.js';
import { useImages, Avatar } from './shared.jsx';
import { PostCard, Composer, Lightbox, ReportModal } from './parts.jsx';
import { ask } from './dialog.jsx';
import { DeletePlaceModal, useStaffRole } from './ModerationModals.jsx';
import { Crosshair, MagnifyingGlass, MapPin, Plus, UsersThree, X } from '@phosphor-icons/react';
import './more.css';
import LocalityPicker from './LocalityPicker.jsx';

/* The map screen. It lives in its own file so Leaflet (about 150 kB) is only downloaded when someone opens the map (App.jsx loads this file lazily). */
/* ---------------- Map ---------------- */
const TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

function PlaceSheet({ place, me, go, notify, onClose, onChanged }) {
  const [rows, setRows] = useState(null); const [lb, setLb] = useState(null); const [rep, setRep] = useState(false); const [mod, setMod] = useState(false); const staff = useStaffRole();
  const load = () => posts.feed({ placeId: place.id, limit: 30 }).then(setRows).catch((e) => { notify(e.message, 'err'); setRows([]); });
  useEffect(() => { setRows(null); load(); }, [place.id]);
  const img = useImages((rows || []).flatMap((p) => [p.image_path, p.author_avatar_path]));
  const here = [...new Map((rows || []).filter((p) => p.author_is_friend).map((p) => [p.author_id, p])).values()];
  const pics = (rows || []).filter((p) => p.image_path && img[p.image_path]);
  const change = (np) => setRows((r) => r.map((x) => (x.id === np.id ? np : x))); const drop = (id) => setRows((r) => r.filter((x) => x.id !== id));
  return (<aside className="sheet"><header><div><h3>{place.name}</h3>{place.description && <p className="muted">{place.description}</p>}</div><button className="ghost sm" onClick={onClose} aria-label="Close">✕</button></header>
    {here.length > 0 && <div><h4>Friends who have been here</h4><div className="mlist">{here.map((p) => <button key={p.author_id} className="chip" onClick={() => go('profile', p.author_username)}><Avatar src={img[p.author_avatar_path]} size={26} />{p.author_display_name}</button>)}</div></div>}
    {pics.length > 0 && <div className="pstrip">{pics.map((p, i) => <button key={p.id} onClick={() => setLb(i)}><img src={img[p.image_path]} alt="" /></button>)}</div>}
    <Composer me={me} fixedPlace={place.id} onPosted={() => { load(); onChanged(); }} notify={notify} />
    {rows ? (rows.length ? rows.map((p) => <PostCard key={p.id} p={p} me={me} img={img} go={go} onChange={change} onDelete={drop} notify={notify} />) : <p className="empty">Nobody has posted here yet.</p>) : <div className="boot">Loading…</div>}
    {place.created_by === me.id && <button className="ghost sm danger" onClick={async () => { if (!(await ask({ title: 'Delete this place?', message: 'Posts stay, but lose the place tag.', confirmLabel: 'Delete', danger: true }))) return; try { await social.deletePlace(place.id); onChanged(); onClose(); notify('Place deleted'); } catch (e) { notify(e.message, 'err'); } }}>Delete place</button>}
    {place.created_by !== me.id && <button className="ghost sm" onClick={() => setRep(true)}>Report place</button>}
    {staff && place.created_by !== me.id && <button className="ghost sm danger" onClick={() => setMod(true)}>Delete place (moderator)…</button>}
    {rep && <ReportModal target={{ type: 'place', id: place.id }} onClose={() => setRep(false)} notify={notify} />}
    {mod && <DeletePlaceModal place={{ id: place.id, name: place.name }} notify={notify} onClose={() => setMod(false)} onDone={() => { setMod(false); onChanged(); onClose(); }} />}
    {lb != null && <Lightbox items={pics.map((p) => ({ id: p.id, src: img[p.image_path], caption: p.body }))} index={lb} onClose={() => setLb(null)} onIndex={setLb} />}
  </aside>);
}

export function MapView({ me, go, notify }) {
  const box = useRef(), map = useRef(), group = useRef(), addRef = useRef(false), fitted = useRef(false);
  const [places, setPlaces] = useState([]); const [fr, setFr] = useState([]); const [locs, setLocs] = useState([]); const [show, setShow] = useState({ places: true, friends: true });
  const [ready, setReady] = useState(false); const [sel, setSel] = useState(null); const [q, setQ] = useState(''); const [res, setRes] = useState(null); const [cand, setCand] = useState(null); const [searching, setSearching] = useState(false); const candMk = useRef(); const [adding, setAdding] = useState(false); const [pin, setPin] = useState(null); const [form, setForm] = useState({ name: '', description: '', locality: '' });
  const img = useImages(fr.map((f) => f.avatar_path));
  const refresh = () => social.listPlaces().then((r) => { setPlaces(r); setSel((s) => s && r.find((x) => x.id === s.id)); }).catch((e) => notify(e.message, 'err'));
  useEffect(() => {
    const m = L.map(box.current, { zoomControl: false, worldCopyJump: false, attributionControl: false }).setView([46.2, 22.6], 8);   // Bihor / Alba / Arad until we know better
    L.control.zoom({ position: 'bottomright' }).addTo(m);   // bottom right: the top left belongs to the search bar
    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(m);   // OpenStreetMap credit stays (required); the extra "Leaflet" + flag prefix is gone, so the strip is short and never wraps on a phone
    L.tileLayer(TILE, { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' }).addTo(m);
    group.current = L.layerGroup().addTo(m); map.current = m;
    m.on('click', (e) => { if (addRef.current) setPin(e.latlng); });
    Promise.allSettled([refresh(), discover.friendsMap().then(setFr), discover.listLocalities().then(setLocs)]).then(() => setReady(true));   // frame the first view once everything is in, not after the first answer
    return () => m.remove();
  }, []);
  useEffect(() => { addRef.current = adding; box.current.classList.toggle('adding', adding); }, [adding]);
  // First view: your own locality (zoomed in), else wherever places and friends are. Never "every locality in the table": with ~1500 of them that is three whole counties.
  const home = locs.find((l) => me?.locality_id && l.id === me.locality_id && l.lat != null);
  const frame = useCallback((animate) => {
    const m = map.current; if (!m) return;
    const pts = [...places.map((p) => [p.lat, p.lng]), ...fr.filter((f) => f.lat != null).map((f) => [f.lat, f.lng])];
    if (home && pts.length <= 1) m.setView([home.lat, home.lng], 12, { animate });
    else if (pts.length) m.fitBounds(pts, { padding: [60, 60], maxZoom: 14, animate });
    else if (home) m.setView([home.lat, home.lng], 12, { animate });
  }, [places, fr, home]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!ready || fitted.current || !map.current) return; fitted.current = true; frame(false); }, [ready, frame]);
  // The map box changes size when the place panel opens or closes (and when a phone is rotated). Leaflet only listens for window resizes, so without this
  // it keeps the old size: the tiles stop short, and the place does not land in the middle of what you can see.
  useEffect(() => {
    const el = box.current; if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => map.current?.invalidateSize({ animate: false })); ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => { if (!sel) return; map.current.invalidateSize({ animate: false }); map.current.panTo([sel.lat, sel.lng]); }, [sel?.id]);
  useEffect(() => {
    const g = group.current; g.clearLayers();
    if (show.places) places.forEach((p) => L.marker([p.lat, p.lng], { title: p.name, zIndexOffset: 1000, icon: L.divIcon({ className: 'mk', iconSize: [34, 34], iconAnchor: [17, 17],
      html: `<div class="mkp${p.friends_there ? ' hot' : ''}"><b>${Number(p.post_count)}</b></div>` }) }).on('click', () => setSel(p)).addTo(g));
    if (show.friends) fr.forEach((f) => { const h = hash(f.id); const src = img[f.avatar_path];
      L.marker([f.lat + ((h % 100) - 50) / 50 * 0.0025, f.lng + (((h >> 7) % 100) - 50) / 50 * 0.0035], { title: f.display_name,
        icon: L.divIcon({ className: 'mk', iconSize: [30, 30], iconAnchor: [15, 15], html: src ? `<img class="mkf" src="${src}" alt="" style="width:30px;height:30px;aspect-ratio:1/1;border-radius:50%;object-fit:cover">` : '<div class="mkf"></div>' }) })
        .on('click', () => go('profile', f.username)).addTo(g); });
  }, [places, fr, show, img]);
  const search = async (e) => { e.preventDefault(); if (q.trim().length < 3 || searching) return; setSearching(true);
    try { setRes(await social.searchPlaces(q.trim(), map.current.getBounds())); } catch (er) { notify(er.message, 'err'); } setSearching(false); };
  const pick = (r) => { setRes(null); const ex = places.find((p) => p.osm_ref === r.ref); if (ex) { setCand(null); setSel(ex); return; } setCand(r); map.current.flyTo([r.lat, r.lng], 17); };
  useEffect(() => { candMk.current?.remove(); candMk.current = null; if (cand) candMk.current = L.marker([cand.lat, cand.lng], { icon: L.divIcon({ className: 'mk', iconSize: [22, 22], iconAnchor: [11, 11], html: '<div class="mkq"></div>' }) }).addTo(map.current); }, [cand]);
  const openCand = async () => { try { const p = await social.createPlace({ name: cand.name, description: cand.label.split(',').slice(1, 3).join(',').trim(), lat: cand.lat, lng: cand.lng, osmRef: cand.ref });
      setCand(null); await refresh(); setSel({ post_count: 0, friends_there: 0, ...p }); } catch (er) { notify(er.message || 'Could not open place', 'err'); } };
  const savePlace = async (e) => { e.preventDefault();
    try { const p = await social.createPlace({ name: form.name, description: form.description, lat: pin.lat, lng: pin.lng, localityId: form.locality ? +form.locality : null });
      setPin(null); setAdding(false); setForm({ name: '', description: '', locality: '' }); await refresh(); setSel({ ...p, post_count: 0, friends_there: 0 }); notify('Place added'); } catch (er) { notify(er.message || 'Could not add place', 'err'); } };
  return (<div className={`mapview view${sel ? ' open' : ''}`}>
    <div className="mapbar"><form className="msearch" onSubmit={search} role="search"><MagnifyingGlass size={18} weight="bold" aria-hidden="true" />
        <input value={q} onChange={(e) => { setQ(e.target.value); if (res) setRes(null); }} onKeyDown={(e) => { if (e.key === 'Escape') { setRes(null); setQ(''); } }} placeholder="Search a café, school, park…" aria-label="Search for a real place" autoComplete="off" enterKeyHint="search" maxLength={80} />
        {q && <button type="button" className="mclear" aria-label="Clear search" onClick={() => { setQ(''); setRes(null); }}><X size={14} weight="bold" aria-hidden="true" /></button>}
        {q.trim() && <button className="primary sm" disabled={searching || q.trim().length < 3} title={q.trim().length < 3 ? 'Type at least 3 letters' : undefined}>{searching ? 'Searching…' : 'Search'}</button>}</form>
      {res && <div className="sresults" role="region" aria-label="Search results">{!res.length && <p className="muted">Nothing found near this part of the map. Zoom out or try another name.</p>}{res.map((r) => <button key={r.ref} onClick={() => pick(r)}><b>{r.name}</b><small>{r.label}</small></button>)}<button className="ghost sm" onClick={() => setRes(null)}>Close</button></div>}
      <div className="mtogs" role="group" aria-label="What to show on the map">
        <button type="button" className={`mtog${show.places ? ' on' : ''}`} aria-pressed={show.places} onClick={() => setShow({ ...show, places: !show.places })}><MapPin size={16} weight="bold" aria-hidden="true" /><span className="mlbl">Places</span><span className="mcount">{places.length}</span></button>
        <button type="button" className={`mtog${show.friends ? ' on' : ''}`} aria-pressed={show.friends} onClick={() => setShow({ ...show, friends: !show.friends })}><UsersThree size={16} weight="bold" aria-hidden="true" /><span className="mlbl">Friends</span><span className="mcount">{fr.length}</span></button></div>
      <button type="button" className={`madd${adding ? ' on' : ''}`} aria-pressed={adding} onClick={() => { setAdding(!adding); setPin(null); setCand(null); }}>{adding ? <><X size={16} weight="bold" aria-hidden="true" /><span className="mlbl">Cancel</span></> : <><Plus size={16} weight="bold" aria-hidden="true" /><span className="mlbl">Add a place</span></>}</button></div>
    <div className="mapwrap"><div ref={box} className="leaflet-box" />
      <button type="button" className="mrecenter" onClick={() => frame(true)} aria-label="Recenter the map" title="Recenter"><Crosshair size={20} weight="bold" aria-hidden="true" /></button>
      {adding && !pin && <p className="maphint" role="status">Tap the map where the place is.</p>}
      {cand && <div className="cand"><div><b>{cand.name}</b><small>{cand.label}</small></div><div className="acts"><button className="primary sm" onClick={openCand}>Post from here</button><button className="ghost sm" onClick={() => setCand(null)}>Dismiss</button></div></div>}
      {!places.length && !fr.length && !adding && !cand && !res && <p className="maphint">Nothing here yet. Search a real place above, or use “Add a place” and tap the map.</p>}</div>
    {sel && <PlaceSheet key={sel.id} place={sel} me={me} go={go} notify={notify} onClose={() => setSel(null)} onChanged={refresh} />}
    {pin && <div className="modal" onClick={() => setPin(null)}><form className="panel mform" onClick={(e) => e.stopPropagation()} onSubmit={savePlace}><h3>New place</h3>
      <input autoFocus required minLength={2} maxLength={80} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <textarea rows="2" maxLength={300} placeholder="Short description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <LocalityPicker locs={locs} value={form.locality} onChange={(id) => setForm({ ...form, locality: id })} emptyLabel="Locality (optional)" ariaLabel="Locality" />
      <div className="acts"><button className="primary">Save place</button><button type="button" className="ghost" onClick={() => setPin(null)}>Cancel</button></div></form></div>}
  </div>);
}

export default MapView;
