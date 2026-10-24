import { useCallback, useEffect, useRef, useState } from 'react';
import { auth, profiles, friends, wall, posts, discover, media, safety, errorCode } from '../index.js';
import { themeStyle } from './theme.js';
import Player from './Player.jsx';
import Customizer from './Customizer.jsx';

function useImages(paths) {
  const [m, setM] = useState({}); const k = paths.filter(Boolean).join('|');
  useEffect(() => { if (k) media.signedUrls(paths).then(setM).catch(() => {}); else setM({}); }, [k]);
  return m;
}
const Boot = () => <div className="boot">…</div>;

function Auth() {
  const [mode, setMode] = useState('in'); const [f, setF] = useState({ email: '', password: '', username: '', displayName: '' });
  const [msg, setMsg] = useState(''); const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const go = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      if (mode === 'in') await auth.signIn(f);
      else { const r = await auth.signUp(f); if (!r.session) setMsg('Check your email to confirm the account.'); }
    } catch (er) { setMsg(er.message === 'username_taken' ? 'Username taken.' : er.message); }
  };
  return (
    <div className="authwrap"><form className="card authcard" onSubmit={go}>
      <h1 className="brand">fiiyou</h1>
      {mode === 'up' && <><input placeholder="username (a-z, 0-9, _)" value={f.username} onChange={set('username')} required />
        <input placeholder="display name" value={f.displayName} onChange={set('displayName')} /></>}
      <input type="email" placeholder="email" value={f.email} onChange={set('email')} required />
      <input type="password" placeholder="password" value={f.password} onChange={set('password')} required minLength={8} />
      {msg && <p className="err">{msg}</p>}
      <button className="primary">{mode === 'in' ? 'Sign in' : 'Create account'}</button>
      <button type="button" className="ghost" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
        {mode === 'in' ? 'New here? Sign up' : 'Have an account? Sign in'}</button>
    </form></div>
  );
}

function Guestbook({ profileId }) {
  const [rows, setRows] = useState([]); const [body, setBody] = useState(''); const [err, setErr] = useState('');
  const load = () => wall.listWall(profileId).then(setRows); useEffect(() => { load(); }, [profileId]);
  const send = async (e) => { e.preventDefault(); setErr('');
    try { await wall.postOnWall(profileId, body); setBody(''); load(); } catch (er) { setErr(errorCode(er) === 'rate_limit' ? 'Slow down a bit.' : 'Cannot post here.'); } };
  return (<>
    <form className="inline" onSubmit={send}><input value={body} maxLength={500} onChange={(e) => setBody(e.target.value)} placeholder="Write something…" />
      <button className="primary" disabled={!body.trim()}>Send</button></form>
    {err && <p className="err">{err}</p>}
    {rows.map((r) => (<div className="msg" key={r.id}><b>{r.author.display_name}</b> <span className="muted">@{r.author.username}</span>
      <p>{r.body}</p><button className="ghost sm" onClick={() => wall.deleteWallComment(r.id).then(load).catch(() => {})}>delete</button></div>))}
  </>);
}

function CardView({ c, d, img, go }) {
  const body = {
    about: () => <p className="pre">{c.content.body}</p>, text: () => <p className="pre">{c.content.body}</p>,
    gallery: () => <div className="gal">{(c.content.images || []).map((p) => img[p] && <img key={p} src={img[p]} alt="" />)}</div>,
    links: () => <ul>{(c.content.links || []).map((l, i) => <li key={i}><a href={l.url} target="_blank" rel="noopener noreferrer nofollow">{l.label}</a></li>)}</ul>,
    interests: () => <div className="tags">{(c.content.interests || []).map((t) => <span key={t}>{t}</span>)}</div>,
    top_friends: () => <div className="top">{d.topFriends.map((f) => (
      <button key={f.id} className="ghost" onClick={() => go('profile', f.username)}>
        {f.avatar_path && img[f.avatar_path] ? <img src={img[f.avatar_path]} alt="" /> : <i />}<span>{f.display_name}</span></button>))}</div>,
    guestbook: () => <Guestbook profileId={d.profile.id} />,
  }[c.type];
  return body ? <section className="card"><h2>{c.title}</h2>{body()}</section> : null;
}

const cl = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function Sticker({ c, k, src, edit, selected, onSelect, onChange }) {
  const drag = (e, mode) => {
    if (!edit) return; e.preventDefault(); e.stopPropagation(); onSelect(c.id);
    const sx = e.clientX, sy = e.clientY, o = { x: c.x, y: c.y, w: c.w }, ar = c.w / c.h;
    const mv = (ev) => { const dx = (ev.clientX - sx) / k, dy = (ev.clientY - sy) / k;
      if (mode === 'move') onChange({ x: cl(Math.round(o.x + dx), -500, 5000), y: cl(Math.round(o.y + dy), -500, 5000) });
      else { const w = cl(Math.round(o.w + dx), 40, 1200); onChange({ w, h: cl(Math.round(w / ar), 40, 2000) }); } };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };
  return (<div className={`sticker${edit ? ' edit' : ''}${selected ? ' sel' : ''}`} onPointerDown={(e) => drag(e, 'move')}
    style={{ left: c.x * k, top: c.y * k, width: c.w * k, height: c.h * k, zIndex: 100 + c.z, transform: `rotate(${c.rotation}deg)` }}>
    {src && <img src={src} alt="" draggable={false} />}{edit && selected && <b className="grip" onPointerDown={(e) => drag(e, 'size')} />}</div>);
}

function ProfileView({ username, go, notify }) {
  const [d, setD] = useState(null); const [draft, setDraft] = useState(null); const [sel, setSel] = useState(null); const [k, setK] = useState(1); const frame = useRef();
  const load = useCallback(() => profiles.getFullProfile(username).then(setD), [username]);
  useEffect(() => { setD(null); setDraft(null); setSel(null); load(); }, [load]);
  useEffect(() => { const el = frame.current; if (!el) return; const ro = new ResizeObserver(() => setK(Math.min(1, el.clientWidth / 1210) || 1)); ro.observe(el); return () => ro.disconnect(); }, [d]);
  const shown = draft ? draft.cards : d?.cards; const theme = draft ? draft.theme : d?.profile.theme; const music = (draft ? draft.fields.music : d?.profile.music) || {};
  const img = useImages(d ? [d.profile.avatar_path, theme.bg_image, music.cover, ...shown.flatMap((c) => c.content.images || []), ...d.topFriends.map((f) => f.avatar_path)] : []);
  const [audioUrl, setAudioUrl] = useState(null);
  useEffect(() => { let on = true; setAudioUrl(null); if (music.audio) media.signedUrl(music.audio, 'audio').then((u) => on && setAudioUrl(u)).catch(() => {}); return () => { on = false; }; }, [music.audio]);
  if (!d) return <Boot />;
  const { profile, relationship: rel } = d; const own = rel.status === 'self';
  const startEdit = () => setDraft({ theme: { ...profile.theme }, cards: d.cards.map((c) => ({ ...c })),
    fields: { display_name: profile.display_name, headline: profile.headline, locality_id: profile.locality_id, wall_policy: profile.wall_policy, show_on_map: profile.show_on_map, music: profile.music || {} } });
  const patch = (id, p) => setDraft((x) => ({ ...x, cards: x.cards.map((c) => (c.id === id ? { ...c, ...p } : c)) }));
  const act = (fn, msg) => fn().then(() => { notify(msg); load(); }).catch((e) => notify(e.message, 'err'));
  const friendBtn = { none: ['Add friend', () => friends.sendRequest(profile.id), 'Request sent'], pending_sent: ['Cancel request', () => friends.removeFriend(profile.id), 'Request cancelled'],
    pending_received: ['Accept request', () => friends.acceptRequest(rel.id), 'You are now friends'], friends: ['Unfriend', () => friends.removeFriend(profile.id), 'Removed'] }[rel.status];
  const name = draft?.fields.display_name ?? profile.display_name; const headline = draft?.fields.headline ?? profile.headline;
  return (
    <>
    <div className={`page view${draft ? ' editing' : ''}`} style={themeStyle(theme, img[theme.bg_image])} onPointerDown={() => draft && setSel(null)}>
      <div className="dim" />
      <main className="frame" ref={frame} data-layout={theme.layout || 'side-left'}>
        <aside className="side">
          <div className="avatar">{img[profile.avatar_path] ? <img src={img[profile.avatar_path]} alt="" /> : <i />}</div>
          <div className="nameplate"><h1>{name}</h1><small>@{profile.username}{profile.locality ? ` · ${profile.locality.name}` : ''}</small></div>
          {headline && <p className="headline">{headline}</p>}
          {(audioUrl || music.url) && <Player key={music.audio || music.url} src={audioUrl || music.url} title={music.title} artist={music.artist} cover={img[music.cover]} />}
          {own ? !draft && <button className="primary wide" onClick={startEdit}>Customize profile</button> : friendBtn &&
            <div className="actions"><button className="primary" onClick={() => act(friendBtn[1], friendBtn[2])}>{friendBtn[0]}</button>
              <button className="ghost" onClick={() => confirm('Block this person?') && safety.blockUser(profile.id).then(() => go('discover'))}>Block</button></div>}
        </aside>
        <div className="divider" />
        <div className="cards">{shown.filter((c) => c.visible && c.type !== 'music' && c.type !== 'sticker').map((c) => <CardView key={c.id} c={c} d={d} img={img} go={go} />)}</div>
        {shown.filter((c) => c.type === 'sticker' && c.visible).map((c) => (
          <Sticker key={c.id} c={c} k={k} src={img[c.content.images?.[0]]} edit={!!draft} selected={sel === c.id} onSelect={setSel} onChange={(p) => patch(c.id, p)} />))}
      </main>
    </div>
      {draft && <Customizer draft={draft} setDraft={setDraft} onClose={() => setDraft(null)} reload={load} sel={sel} setSel={setSel} notify={notify} />}
    </>
  );
}

function FriendMap({ me, go }) {
  const [rows, setRows] = useState(null); const [locs, setLocs] = useState([]); const [pick, setPick] = useState(null);
  useEffect(() => { Promise.all([discover.friendsMap(), discover.listLocalities()]).then(([r, l]) => { setRows(r); setLocs(l); }).catch(() => setRows([])); }, []);
  const people = [...(rows || []), ...(me.locality_id ? [{ id: me.id, display_name: 'You', username: me.username, avatar_path: me.avatar_path, locality_id: me.locality_id, me: true }] : [])];
  const img = useImages(people.map((p) => p.avatar_path));
  if (!rows) return <div className="panel boot">Loading map…</div>;
  const pts = locs.filter((l) => l.lat != null && l.lng != null); const by = {};
  people.forEach((p) => { (by[p.locality_id] ||= []).push(p); });
  if (pts.length < 2) return (<div className="panel"><h3>Friends map</h3><p className="note">The map needs coordinates. Add lat and lng to the localities in Supabase (Table Editor → localities).</p>
    {locs.filter((l) => by[l.id]).map((l) => <p key={l.id}><b>{l.name}</b> · {by[l.id].map((p) => p.display_name).join(', ')}</p>)}</div>);
  const kx = Math.cos(pts.reduce((a, p) => a + p.lat, 0) / pts.length * Math.PI / 180);
  const X = pts.map((p) => p.lng * kx), Y = pts.map((p) => -p.lat); const x0 = Math.min(...X), y0 = Math.min(...Y); const sx = (Math.max(...X) - x0) || 1, sy = (Math.max(...Y) - y0) || 1;
  const pos = (l) => ({ left: `${8 + (l.lng * kx - x0) / sx * 84}%`, top: `${12 + (-l.lat - y0) / sy * 76}%` });
  const ratio = Math.min(2, Math.max(0.9, sx / sy)); const open = pick && by[pick] ? by[pick] : [];
  return (<div className="panel"><div className="phead"><h3>Friends map</h3><small>{rows.length} friend{rows.length === 1 ? '' : 's'} shown</small></div>
    <div className="map" style={{ aspectRatio: ratio }}>
      {pts.map((l) => { const g = by[l.id]; return (<button key={l.id} className={`pin${g ? ' has' : ''}${pick === l.id ? ' on' : ''}`} style={pos(l)} disabled={!g} onClick={() => setPick(pick === l.id ? null : l.id)}>
        {g ? <span className="avs">{g.slice(0, 3).map((p) => (img[p.avatar_path] ? <img key={p.id} src={img[p.avatar_path]} alt="" /> : <i key={p.id} />))}{g.length > 3 && <em>+{g.length - 3}</em>}</span> : <span className="dot" />}
        <span className="lbl">{l.name}</span></button>); })}</div>
    {!me.show_on_map && <p className="note">You are hidden from your friends' maps. Turn it on in Customize → Profile.</p>}
    {open.length > 0 && <div className="mlist">{open.map((p) => <button key={p.id} className="chip" onClick={() => !p.me && go('profile', p.username)}>{img[p.avatar_path] ? <img src={img[p.avatar_path]} alt="" /> : <i />}{p.display_name}</button>)}</div>}
  </div>);
}

function FriendsView({ me, go, notify }) {
  const [inc, setInc] = useState([]); const [list, setList] = useState([]); const [tab, setTab] = useState('friends');
  const load = () => { friends.incomingRequests().then(setInc); friends.listFriends().then(setList); }; useEffect(load, []);
  const img = useImages([...inc.map((r) => r.from.avatar_path), ...list.map((f) => f.avatar_path)]);
  const row = (p, extra) => (<div className="row" key={p.id}>{img[p.avatar_path] ? <img src={img[p.avatar_path]} alt="" /> : <i />}
    <button className="link" onClick={() => go('profile', p.username)}>{p.display_name}<small>@{p.username}</small></button>{extra}</div>);
  const answer = (fn, msg) => fn().then(() => { notify(msg); load(); }).catch((e) => notify(e.message, 'err'));
  return (<div className="plain view"><FriendMap me={me} go={go} />
    <div className="tabs"><button className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>Friends <span className="count">{list.length}</span></button>
      <button className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>Requests {inc.length > 0 && <span className="count hot">{inc.length}</span>}</button></div>
    {tab === 'friends' ? (list.length ? list.map((f) => row(f)) : <p className="empty">No friends yet. Find people in Connect & discover.</p>)
      : (inc.length ? inc.map((r) => row(r.from, <span className="acts"><button className="primary sm" onClick={() => answer(() => friends.acceptRequest(r.id), 'Friend added')}>Accept</button>
        <button className="ghost sm" onClick={() => answer(() => friends.declineRequest(r.id), 'Declined')}>Decline</button></span>)) : <p className="empty">No pending requests.</p>)}</div>);
}

function DiscoverView({ go }) {
  const [tab, setTab] = useState('people'); const [q, setQ] = useState(''); const [loc, setLoc] = useState('');
  const [mode, setMode] = useState('random'); const [people, setPeople] = useState([]); const [locs, setLocs] = useState([]);
  const [feed, setFeed] = useState([]); const [body, setBody] = useState(''); const [kind, setKind] = useState('status'); const [when, setWhen] = useState('');
  useEffect(() => { discover.listLocalities().then(setLocs); }, []);
  useEffect(() => { (q.trim().length >= 2 ? discover.searchProfiles(q) : discover.discover({ localityId: loc ? +loc : null, mode })).then(setPeople); }, [q, loc, mode]);
  const loadFeed = () => posts.localFeed({ localityId: loc ? +loc : null }).then(setFeed); useEffect(() => { if (tab === 'local') loadFeed(); }, [tab, loc]);
  const img = useImages(people.map((p) => p.avatar_path));
  const post = async (e) => { e.preventDefault(); await posts.createPost({ body, kind, localityId: loc ? +loc : null, eventAt: kind === 'event' && when ? new Date(when).toISOString() : null }); setBody(''); loadFeed(); };
  return (<div className="plain"><div className="tabs"><button className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>People</button>
    <button className={tab === 'local' ? 'on' : ''} onClick={() => setTab('local')}>Local feed</button>
    <select value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">All places</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
    {tab === 'people' ? <>
      <div className="inline"><input placeholder="Search name or @username" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={mode} onChange={(e) => setMode(e.target.value)}><option value="random">random</option><option value="new">newest</option></select></div>
      {people.map((p) => (<div className="row" key={p.id}>{img[p.avatar_path] ? <img src={img[p.avatar_path]} alt="" /> : <i />}
        <button className="link" onClick={() => go('profile', p.username)}>{p.display_name}<small>@{p.username}{p.headline ? ` · ${p.headline}` : ''}</small></button></div>))}</>
    : <>
      <form className="inline" onSubmit={post}><input value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} placeholder="What's happening around here?" />
        <select value={kind} onChange={(e) => setKind(e.target.value)}><option>status</option><option>event</option><option>ask</option></select>
        {kind === 'event' && <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />}
        <button className="primary" disabled={!body.trim()}>Post</button></form>
      {feed.map((p) => (<div className="msg" key={p.id}><b>{p.author_display_name}</b> <span className="muted">@{p.author_username} · {p.kind}{p.event_at ? ` · ${new Date(p.event_at).toLocaleString('ro-RO')}` : ''}</span><p>{p.body}</p></div>))}</>}
  </div>);
}

export default function App() {
  const [session, setSession] = useState(undefined); const [me, setMe] = useState(null); const [route, setRoute] = useState({ v: 'profile' });
  const [menu, setMenu] = useState(false); const [toast, setToast] = useState(null);
  useEffect(() => { auth.getSession().then(setSession); return auth.onAuthChange(setSession); }, []);
  useEffect(() => { if (session) profiles.getMyProfile().then(setMe); else setMe(null); }, [session]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3200); return () => clearTimeout(t); }, [toast]);
  if (session === undefined) return <Boot />;
  if (!session) return <Auth />;
  if (!me) return <Boot />;
  const notify = (msg, type = 'ok') => setToast({ msg, type });
  const go = (v, username) => { setRoute({ v, username }); setMenu(false); window.scrollTo(0, 0); };
  const NAV = [['profile', 'My profile'], ['friends', 'My friends'], ['discover', 'Connect & discover']];
  const mine = route.v === 'profile' && (!route.username || route.username === me.username);
  return (<div className="app">
    <nav className="nav"><button className="logo" onClick={() => go('profile')}>fiiyou</button>
      {NAV.map(([v, l]) => <button key={v} className={(v === 'profile' ? mine : route.v === v) ? 'on' : ''} onClick={() => go(v)}>{l}</button>)}
      <div className="more"><button onClick={() => setMenu(!menu)} aria-label="More">•••</button>{menu && <div className="menu">
        <button onClick={() => auth.exportMyData().then((j) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' })); a.download = 'fiiyou-data.json'; a.click(); })}>Export my data</button>
        <button onClick={() => auth.signOut()}>Sign out</button>
        <button className="danger" onClick={() => confirm('Delete your account and everything in it? This cannot be undone.') && auth.deleteAccount()}>Delete account</button></div>}</div></nav>
    {route.v === 'profile' && <ProfileView key={route.username || me.username} username={route.username || me.username} go={go} notify={notify} />}
    {route.v === 'friends' && <FriendsView me={me} go={go} notify={notify} />}
    {route.v === 'discover' && <DiscoverView go={go} />}
    {toast && <div className={`toast ${toast.type}`} role="status">{toast.msg}</div>}
  </div>);
}
