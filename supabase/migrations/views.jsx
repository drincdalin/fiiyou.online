import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { posts, social, friends, discover, profiles } from '../index.js';
import { useImages, Avatar, ago } from './shared.jsx';
import { PostCard, Composer, Lightbox } from './parts.jsx';
import { SharedPostCard, decodeSharedPost, previewText } from './PostShare.jsx';
import { ask } from './dialog.jsx';
import { ArrowBendUpLeft, PaperPlaneRight, X } from '@phosphor-icons/react';

const useFeed = (args, notify) => {
  const [rows, setRows] = useState(null); const [more, setMore] = useState(false); const key = JSON.stringify(args);
  const load = useCallback(async (append = false, cur = []) => {
    try { const before = append && cur.length ? cur[cur.length - 1].created_at : null; const r = await posts.feed({ ...args, before, limit: 20 });
      setRows(append ? [...cur, ...r] : r); setMore(r.length === 20 && !args.upcoming); } catch (e) { notify(e.message, 'err'); setRows([]); }
  }, [key]);
  useEffect(() => { setRows(null); load(false); }, [load]);
  const img = useImages((rows || []).flatMap((p) => [p.image_path, p.author_avatar_path]));
  const change = (np) => setRows((r) => r.map((x) => (x.id === np.id ? np : x))); const drop = (id) => setRows((r) => r.filter((x) => x.id !== id));
  return { rows, more, load, img, change, drop };
};
const List = ({ f, me, go, notify, empty }) => !f.rows ? <div className="boot">Loading…</div> : (<>
  {!f.rows.length && <p className="empty">{empty}</p>}
  {f.rows.map((p) => <PostCard key={p.id} p={p} me={me} img={f.img} go={go} onChange={f.change} onDelete={f.drop} notify={notify} />)}
  {f.more && <button className="ghost wide" onClick={() => f.load(true, f.rows)}>Load more</button>}</>);

/* ---------------- Home ---------------- */
function Snapshot({ go, unread }) {
  const [me, setMe] = useState(null); const [req, setReq] = useState(0); const [views, setViews] = useState(null); const [fresh, setFresh] = useState([]);
  useEffect(() => { profiles.getMyProfile().then((p) => { setMe(p); profiles.myViews(p.id).then(setViews).catch(() => {}); }).catch(() => {});
    friends.incomingRequests().then((r) => setReq(r.length)).catch(() => {}); discover.discover({ mode: 'new', limit: 3 }).then(setFresh).catch(() => {}); }, []);
  const img = useImages([me?.avatar_path, ...fresh.map((p) => p.avatar_path)]);
  if (!me) return <aside className="snap panel"><div className="boot">…</div></aside>;
  return (<aside className="snap panel"><div className="snaptop"><Avatar src={img[me.avatar_path]} size={64} /><div><b>{me.display_name}</b><small>{me.headline || 'No mood set yet'}</small></div></div>
    <div className="stats3"><button onClick={() => go('messages')}><b>{unread}</b><small>messages</small></button><button onClick={() => go('people')}><b>{req}</b><small>requests</small></button><span><b>{views ?? '–'}</b><small>views</small></span></div>
    <button className="primary wide" onClick={() => go('profile', null, null, true)}>Edit my profile</button>
    {fresh.length > 0 && <><h4>Cool new people</h4><div className="newp">{fresh.map((p) => <button key={p.id} onClick={() => go('profile', p.username)}><Avatar src={img[p.avatar_path]} size={52} /><small>{p.display_name}</small></button>)}</div></>}
  </aside>);
}

export function HomeView({ me, go, notify, unread }) {
  const [tab, setTab] = useState('nearby'); const [loc, setLoc] = useState(''); const [locs, setLocs] = useState([]); const [places, setPlaces] = useState([]);
  useEffect(() => { discover.listLocalities().then(setLocs); social.listPlaces().then(setPlaces).catch(() => {}); }, []);
  const f = useFeed(tab === 'events' ? { kind: 'event', upcoming: true, localityId: loc ? +loc : null } : { onlyFriends: tab === 'friends', localityId: loc ? +loc : null }, notify);
  return (<div className="plain wide view"><div className="homegrid"><Snapshot go={go} unread={unread} />
    <div className="homemain"><Composer me={me} places={places} onPosted={() => f.load(false)} notify={notify} />
      <div className="tabs"><button className={tab === 'nearby' ? 'on' : ''} onClick={() => setTab('nearby')}>Around you</button><button className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>Friend updates</button><button className={tab === 'events' ? 'on' : ''} onClick={() => setTab('events')}>Events</button>
        <select value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Place"><option value="">All localities</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
      <List f={f} me={me} go={go} notify={notify} empty={tab === 'friends' ? 'Nothing from friends yet.' : tab === 'events' ? 'No upcoming events.' : 'No posts yet. Be the first.'} /></div></div></div>);
}

/* ---------------- Map ---------------- */
const TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

function PlaceSheet({ place, me, go, notify, onClose, onChanged }) {
  const [rows, setRows] = useState(null); const [lb, setLb] = useState(null);
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
    {lb != null && <Lightbox items={pics.map((p) => ({ id: p.id, src: img[p.image_path], caption: p.body }))} index={lb} onClose={() => setLb(null)} onIndex={setLb} />}
  </aside>);
}

export function MapView({ me, go, notify }) {
  const box = useRef(), map = useRef(), group = useRef(), addRef = useRef(false), fitted = useRef(false);
  const [places, setPlaces] = useState([]); const [fr, setFr] = useState([]); const [locs, setLocs] = useState([]); const [show, setShow] = useState({ places: true, friends: true });
  const [sel, setSel] = useState(null); const [q, setQ] = useState(''); const [res, setRes] = useState(null); const [cand, setCand] = useState(null); const [searching, setSearching] = useState(false); const candMk = useRef(); const [adding, setAdding] = useState(false); const [pin, setPin] = useState(null); const [form, setForm] = useState({ name: '', description: '', locality: '' });
  const img = useImages(fr.map((f) => f.avatar_path));
  const refresh = () => social.listPlaces().then((r) => { setPlaces(r); setSel((s) => s && r.find((x) => x.id === s.id)); }).catch((e) => notify(e.message, 'err'));
  useEffect(() => {
    const m = L.map(box.current).setView([45.9, 24.9], 7);
    L.tileLayer(TILE, { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m);
    group.current = L.layerGroup().addTo(m); map.current = m;
    m.on('click', (e) => { if (addRef.current) setPin(e.latlng); });
    refresh(); discover.friendsMap().then(setFr).catch(() => {}); discover.listLocalities().then(setLocs);
    return () => m.remove();
  }, []);
  useEffect(() => { addRef.current = adding; box.current.classList.toggle('adding', adding); }, [adding]);
  useEffect(() => { if (fitted.current) return; const pts = [...places.map((p) => [p.lat, p.lng]), ...locs.filter((l) => l.lat != null).map((l) => [l.lat, l.lng])];
    if (pts.length) { map.current.fitBounds(pts, { padding: [40, 40], maxZoom: 15 }); fitted.current = true; } }, [places, locs]);
  useEffect(() => { if (sel) map.current.panTo([sel.lat, sel.lng]); }, [sel?.id]);
  useEffect(() => {
    const g = group.current; g.clearLayers();
    if (show.places) places.forEach((p) => L.marker([p.lat, p.lng], { title: p.name, icon: L.divIcon({ className: 'mk', iconSize: [34, 34], iconAnchor: [17, 17],
      html: `<div class="mkp${p.friends_there ? ' hot' : ''}"><b>${Number(p.post_count)}</b></div>` }) }).on('click', () => setSel(p)).addTo(g));
    if (show.friends) fr.forEach((f) => { const h = hash(f.id); const src = img[f.avatar_path];
      L.marker([f.lat + ((h % 100) - 50) / 50 * 0.0025, f.lng + (((h >> 7) % 100) - 50) / 50 * 0.0035], { title: f.display_name,
        icon: L.divIcon({ className: 'mk', iconSize: [30, 30], iconAnchor: [15, 15], html: src ? `<img class="mkf" src="${src}" alt="">` : '<div class="mkf"></div>' }) })
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
    <div className="mapbar"><form className="msearch" onSubmit={search}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a real place (café, school, park…)" aria-label="Search places" /><button className="primary sm" disabled={searching || q.trim().length < 3}>{searching ? '…' : 'Search'}</button></form>
      {res && <div className="sresults">{!res.length && <p className="muted">Nothing found. Try another name.</p>}{res.map((r) => <button key={r.ref} onClick={() => pick(r)}><b>{r.name}</b><small>{r.label}</small></button>)}<button className="ghost sm" onClick={() => setRes(null)}>Close</button></div>}
      <button className={show.places ? 'on' : ''} onClick={() => setShow({ ...show, places: !show.places })}>Places</button>
      <button className={show.friends ? 'on' : ''} onClick={() => setShow({ ...show, friends: !show.friends })}>Friends</button>
      <button className={adding ? 'primary sm' : 'ghost sm'} onClick={() => { setAdding(!adding); setPin(null); }}>{adding ? 'Tap the map to place it' : 'Add a place'}</button></div>
    <div className="mapwrap"><div ref={box} className="leaflet-box" />
      {cand && <div className="cand"><div><b>{cand.name}</b><small>{cand.label}</small></div><div className="acts"><button className="primary sm" onClick={openCand}>Post from here</button><button className="ghost sm" onClick={() => setCand(null)}>Dismiss</button></div></div>}
      {!places.length && !adding && !cand && <p className="maphint">No places yet. Use "Add a place", then tap the map.</p>}</div>
    {sel && <PlaceSheet key={sel.id} place={sel} me={me} go={go} notify={notify} onClose={() => setSel(null)} onChanged={refresh} />}
    {pin && <div className="modal" onClick={() => setPin(null)}><form className="panel mform" onClick={(e) => e.stopPropagation()} onSubmit={savePlace}><h3>New place</h3>
      <input autoFocus required minLength={2} maxLength={80} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <textarea rows="2" maxLength={300} placeholder="Short description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <select value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })}><option value="">Locality (optional)</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      <div className="acts"><button className="primary">Save place</button><button type="button" className="ghost" onClick={() => setPin(null)}>Cancel</button></div></form></div>}
  </div>);
}

/* ---------------- Messages ---------------- */
const dayLabel = (iso) => { const d = new Date(iso), t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  return d.toDateString() === t.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' }); };
export function MessagesView({ me, peer, go, notify, refreshUnread }) {
  const [convs, setConvs] = useState([]); const [fl, setFl] = useState([]); const [cur, setCur] = useState(peer || null); const [msgs, setMsgs] = useState(null); const [txt, setTxt] = useState(''); const end = useRef(); const inp = useRef(); const [replyTo, setReplyTo] = useState(null);
  const loadConvs = () => social.conversations().then(setConvs).catch(() => {});
  const loadThread = useCallback(async (id) => { try { setMsgs(await social.thread(id)); await social.markRead(id); loadConvs(); refreshUnread(); } catch (e) { notify(e.message, 'err'); } }, []);
  useEffect(() => { loadConvs(); friends.listFriends().then(setFl); }, []);
  useEffect(() => { setMsgs(null); setReplyTo(null); if (cur) loadThread(cur); }, [cur]);
  useEffect(() => { const off = social.onMessage(me.id, () => { loadConvs(); if (cur) loadThread(cur); });
    const t = setInterval(() => { loadConvs(); if (cur) loadThread(cur); }, 12000); return () => { off(); clearInterval(t); }; }, [cur]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs?.length, cur]);
  const img = useImages([...convs, ...fl].map((p) => p.avatar_path));
  const who = convs.find((c) => c.id === cur) || fl.find((f) => f.id === cur);
  const send = async (e) => { e.preventDefault(); const body = txt.trim(); if (!body) return; const rep = replyTo; setTxt(''); setReplyTo(null);
    try { const m = await social.sendMessage(cur, body, rep?.id); setMsgs((x) => [...(x || []), m]); loadConvs(); } catch (er) { setTxt(body); setReplyTo(rep); notify(er.message?.includes('rate_limit') ? 'Slow down a little.' : 'Could not send. Are you still friends?', 'err'); } };
  const startReply = (m) => { setReplyTo(m); inp.current?.focus(); };
  const nameOf = (m) => (m.sender_id === me.id ? 'You' : who?.display_name);
  // the quoted message is looked up among the loaded messages first, so a message that is not a reply (reply_to empty) can never show a quote
  const byId = new Map((msgs || []).map((x) => [x.id, x]));
  const replyLabel = (m, q) => { const them = who?.display_name || 'them'; const mine = m.sender_id === me.id, qm = q.sender_id === me.id;
    return mine ? (qm ? 'You replied to yourself' : `You replied to ${them}`) : (qm ? `${them} replied to you` : `${them} replied to themselves`); };
  /** scroll to the quoted message and flash it (only works while it is among the loaded messages) */
  const jump = (id) => { const el = document.getElementById(`m-${id}`); if (!el) return; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1300); };
  const replyBtn = (m) => <button type="button" className="replybtn" aria-label="Reply" title="Reply" onClick={() => startReply(m)}><ArrowBendUpLeft size={16} weight="bold" aria-hidden="true" /></button>;
  const fresh = fl.filter((f) => !convs.some((c) => c.id === f.id));
  return (<div className={`chat view${cur ? ' thread' : ''}`}>
    <aside className="clist"><h3>Messages</h3>
      {fresh.length > 0 && <select value="" onChange={(e) => e.target.value && setCur(e.target.value)}><option value="">New message…</option>{fresh.map((f) => <option key={f.id} value={f.id}>{f.display_name}</option>)}</select>}
      {!convs.length && !fresh.length && <p className="empty">Add friends to start chatting.</p>}
      {convs.map((c) => (<button key={c.id} className={`crow2${cur === c.id ? ' on' : ''}${c.unread > 0 ? ' unread' : ''}`} onClick={() => setCur(c.id)}><Avatar src={img[c.avatar_path]} size={44} />
        <span className="ctext"><span className="cl1"><b>{c.display_name}</b><small>{ago(c.last_at)}</small></span>
          <span className="cl2"><small className="prev">{c.last_mine ? 'You: ' : ''}{previewText(c.last_body)}</small>{c.unread > 0 && <em className="dotb">{c.unread}</em>}</span></span></button>))}</aside>
    <section className="cthread">{cur && who ? (<>
      <header><button className="ghost sm back" onClick={() => setCur(null)}>‹</button><Avatar src={img[who.avatar_path]} size={34} /><button className="link" onClick={() => go('profile', who.username)}><b>{who.display_name}</b><small>@{who.username}</small></button></header>
      <div className="msgs">{msgs ? (msgs.length ? msgs.map((m, i) => { const mine = m.sender_id === me.id; const newDay = i === 0 || new Date(m.created_at).toDateString() !== new Date(msgs[i - 1].created_at).toDateString();
        const nx = msgs[i + 1]; const first = newDay || msgs[i - 1].sender_id !== m.sender_id;   // first / last bubble of a run from the same person
        const tail = !nx || nx.sender_id !== m.sender_id || new Date(nx.created_at).toDateString() !== new Date(m.created_at).toDateString();
        const q = m.reply_to ? (byId.get(m.reply_to) || (m.reply?.id ? m.reply : null)) : null;
        const sp = decodeSharedPost(m.body);   // a shared post: drawn as a card instead of text
        return (<Fragment key={m.id}>{newDay && <div className="dsep">{dayLabel(m.created_at)}</div>}<div className={`brow${mine ? ' mine' : ''}${first ? ' first' : ''}${tail ? ' tail' : ''}`} id={`m-${m.id}`}>{!mine && (tail ? <Avatar src={img[who.avatar_path]} size={26} /> : <span className="avsp" />)}{mine && replyBtn(m)}
          <div className="bcol">{q && <button type="button" className="rq" onClick={() => jump(q.id)} aria-label="Go to the original message"><span className="rqlab"><ArrowBendUpLeft size={12} weight="bold" aria-hidden="true" />{replyLabel(m, q)}</span><span className="rqtxt">{previewText(q.body)}</span></button>}<div className={`bub${mine ? ' mine' : ''}${sp ? ' hasshare' : ''}`}>{sp ? <><SharedPostCard data={sp.data} go={go} />{sp.note && <p>{sp.note}</p>}</> : <p>{m.body}</p>}<small>{new Date(m.created_at).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}</small></div></div>{!mine && replyBtn(m)}</div></Fragment>); }) : <p className="empty">Say hi.</p>) : <div className="boot">…</div>}<div ref={end} /></div>
      {replyTo && <div className="replybar"><ArrowBendUpLeft className="ric" size={18} weight="bold" aria-hidden="true" /><div><b>Replying to {nameOf(replyTo)}</b><span>{previewText(replyTo.body)}</span></div><button type="button" aria-label="Cancel reply" title="Cancel reply" onClick={() => setReplyTo(null)}><X size={16} weight="bold" aria-hidden="true" /></button></div>}
      <form className="inline" onSubmit={send}><input ref={inp} value={txt} maxLength={1000} placeholder="Write a message…" onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && replyTo && setReplyTo(null)} autoFocus /><button className="primary sendbtn" aria-label="Send" title="Send" disabled={!txt.trim()}><PaperPlaneRight size={20} weight="fill" aria-hidden="true" /></button></form></>)
      : <p className="empty">Pick a conversation.</p>}</section></div>);
}

/* ---------------- People (discover + friends + requests) ---------------- */
export function PeopleView({ me, go, notify }) {
  const [tab, setTab] = useState('discover'); const [q, setQ] = useState(''); const [loc, setLoc] = useState(''); const [mode, setMode] = useState('random'); const [locs, setLocs] = useState([]);
  const [people, setPeople] = useState([]); const [fl, setFl] = useState([]); const [inc, setInc] = useState([]); const [sent, setSent] = useState({});
  const loadF = () => { friends.listFriends().then(setFl); friends.incomingRequests().then(setInc); };
  useEffect(() => { discover.listLocalities().then(setLocs); loadF(); }, []);
  useEffect(() => { (q.trim().length >= 2 ? discover.searchProfiles(q) : discover.discover({ localityId: loc ? +loc : null, mode })).then(setPeople).catch(() => {}); }, [q, loc, mode]);
  const img = useImages([...people, ...fl, ...inc.map((r) => r.from)].map((p) => p.avatar_path));
  const lname = (id) => locs.find((l) => l.id === id)?.name;
  const act = (fn, msg) => fn().then(() => { notify(msg); loadF(); }).catch((e) => notify(e.message, 'err'));
  const row = (p, extra, sub) => (<div className="row" key={p.id}><Avatar src={img[p.avatar_path]} size={44} /><button className="link" onClick={() => go('profile', p.username)}>{p.display_name}<small>{sub ?? `@${p.username}`}</small></button>{extra}</div>);
  return (<div className="plain view"><div className="tabs">
    {[['discover', 'Discover'], ['friends', `Friends`], ['requests', 'Requests']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l} {k === 'friends' && <span className="count">{fl.length}</span>}{k === 'requests' && inc.length > 0 && <span className="count hot">{inc.length}</span>}</button>)}</div>
    {tab === 'discover' && <><div className="inline"><input placeholder="Search name or @username" value={q} onChange={(e) => setQ(e.target.value)} />
      <select value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">Anywhere</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      <select value={mode} onChange={(e) => setMode(e.target.value)}><option value="random">Random</option><option value="new">Newest</option></select></div>
      {!people.length && <p className="empty">No one to show.</p>}
      {people.map((p) => row(p, sent[p.id] ? <small>Request sent</small> : <button className="primary sm" onClick={() => friends.sendRequest(p.id).then(() => { setSent({ ...sent, [p.id]: 1 }); notify('Request sent'); }).catch((e) => notify(e.message, 'err'))}>Add</button>,
        [p.headline, lname(p.locality_id)].filter(Boolean).join(' · ') || `@${p.username}`))}</>}
    {tab === 'friends' && (fl.length ? fl.map((f) => row(f, <span className="acts"><button className="primary sm" onClick={() => go('messages', null, f.id)}>Message</button><button className="ghost sm" onClick={async () => (await ask({ title: 'Remove this friend?', message: `${f.display_name} will be removed from your friends.`, confirmLabel: 'Remove', danger: true })) && act(() => friends.removeFriend(f.id), 'Removed')}>Remove</button></span>)) : <p className="empty">No friends yet. Find people in Discover.</p>)}
    {tab === 'requests' && (inc.length ? inc.map((r) => row(r.from, <span className="acts"><button className="primary sm" onClick={() => act(() => friends.acceptRequest(r.id), 'Friend added')}>Accept</button><button className="ghost sm" onClick={() => act(() => friends.declineRequest(r.id), 'Declined')}>Decline</button></span>)) : <p className="empty">No pending requests.</p>)}
  </div>);
}
