import { useCallback, useEffect, useState } from 'react';
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

function ProfileView({ me, username, go }) {
  const [d, setD] = useState(null); const [draft, setDraft] = useState(null);
  const load = useCallback(() => profiles.getFullProfile(username).then(setD), [username]);
  useEffect(() => { setD(null); setDraft(null); load(); }, [load]);
  const music = d?.cards.find((c) => c.type === 'music' && c.visible);
  const shown = draft ? draft.cards : d?.cards;
  const img = useImages(d ? [d.profile.avatar_path, (draft?.theme || d.profile.theme).bg_image, music?.content.images?.[0],
    ...d.cards.flatMap((c) => c.content.images || []), ...(shown || []).flatMap((c) => c.content.images || []),
    ...d.topFriends.map((f) => f.avatar_path)] : []);
  if (!d) return <Boot />;
  const { profile, relationship: rel } = d; const own = rel.status === 'self';
  const theme = draft ? draft.theme : profile.theme;
  const startEdit = () => setDraft({ theme: { ...profile.theme }, cards: d.cards.map((c) => ({ ...c })),
    fields: { display_name: profile.display_name, headline: profile.headline, locality_id: profile.locality_id, wall_policy: profile.wall_policy, show_on_map: profile.show_on_map } });
  const friendBtn = { none: ['Add friend', () => friends.sendRequest(profile.id)], pending_sent: ['Cancel request', () => friends.removeFriend(profile.id)],
    pending_received: ['Accept request', () => friends.acceptRequest(rel.id)], friends: ['Unfriend', () => friends.removeFriend(profile.id)] }[rel.status];
  const mc = draft ? draft.cards.find((c) => c.type === 'music' && c.visible) : music;
  return (
    <div className="page" style={themeStyle(theme, img[theme.bg_image])}>
      <div className="dim" />
      <main className="frame">
        <aside className="side">
          <div className="avatar">{img[profile.avatar_path] ? <img src={img[profile.avatar_path]} alt="" /> : <i />}</div>
          <div className="nameplate"><h1>{(draft?.fields.display_name ?? profile.display_name)}</h1>
            <small>@{profile.username}{profile.locality ? ` · ${profile.locality.name}` : ''}</small></div>
          {(draft?.fields.headline ?? profile.headline) && <p className="headline">{draft?.fields.headline ?? profile.headline}</p>}
          {mc?.content.url && <Player src={mc.content.url} title={mc.content.title} artist={mc.content.artist} cover={img[mc.content.images?.[0]]} />}
          {own ? !draft && <button className="primary wide" onClick={startEdit}>Customize</button> : friendBtn &&
            <><button className="primary wide" onClick={() => friendBtn[1]().then(load)}>{friendBtn[0]}</button>
              <button className="ghost wide" onClick={() => safety.blockUser(profile.id).then(() => go('discover'))}>Block</button></>}
        </aside>
        <div className="divider" />
        <div className="cards">{(shown || []).filter((c) => c.visible).filter((c) => c.type !== 'music')
          .map((c) => <CardView key={c.id} c={c} d={d} img={img} go={go} />)}</div>
      </main>
      {draft && <Customizer draft={draft} setDraft={setDraft} onClose={() => setDraft(null)} reload={load} />}
    </div>
  );
}

function FriendsView({ go }) {
  const [inc, setInc] = useState([]); const [list, setList] = useState([]);
  const load = () => { friends.incomingRequests().then(setInc); friends.listFriends().then(setList); }; useEffect(load, []);
  const img = useImages([...inc.map((r) => r.from.avatar_path), ...list.map((f) => f.avatar_path)]);
  const row = (p, extra) => (<div className="person" key={p.id}>{img[p.avatar_path] ? <img src={img[p.avatar_path]} alt="" /> : <i />}
    <button className="link" onClick={() => go('profile', p.username)}>{p.display_name}<small>@{p.username}</small></button>{extra}</div>);
  return (<div className="plain"><h2>Requests</h2>{!inc.length && <p className="muted">None.</p>}
    {inc.map((r) => row(r.from, <><button className="primary sm" onClick={() => friends.acceptRequest(r.id).then(load)}>Accept</button>
      <button className="ghost sm" onClick={() => friends.declineRequest(r.id).then(load)}>Decline</button></>))}
    <h2>Friends ({list.length})</h2>{!list.length && <p className="muted">Nobody yet. Try Connect & discover.</p>}
    {list.map((f) => row(f))}</div>);
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
      {people.map((p) => (<div className="person" key={p.id}>{img[p.avatar_path] ? <img src={img[p.avatar_path]} alt="" /> : <i />}
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
  const [menu, setMenu] = useState(false);
  useEffect(() => { auth.getSession().then(setSession); return auth.onAuthChange(setSession); }, []);
  useEffect(() => { if (session) profiles.getMyProfile().then(setMe); else setMe(null); }, [session]);
  if (session === undefined) return <Boot />;
  if (!session) return <Auth />;
  if (!me) return <Boot />;
  const go = (v, username) => { setRoute({ v, username }); setMenu(false); };
  const NAV = [['profile', 'My profile'], ['friends', 'My friends'], ['discover', 'Connect & discover']];
  return (<div className="app">
    <nav className="nav"><button className="logo" onClick={() => go('profile')}>fiiyou</button>
      {NAV.map(([v, l]) => <button key={v} className={route.v === v && !(v === 'profile' && route.username && route.username !== me.username) ? 'on' : ''} onClick={() => go(v)}>{l}</button>)}
      <div className="more"><button onClick={() => setMenu(!menu)}>…</button>{menu && <div className="menu">
        <button onClick={() => auth.exportMyData().then((j) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' })); a.download = 'fiiyou-data.json'; a.click(); })}>Export my data</button>
        <button onClick={() => auth.signOut()}>Sign out</button>
        <button className="danger" onClick={() => confirm('Delete account and everything in it? This cannot be undone.') && auth.deleteAccount()}>Delete account</button></div>}</div></nav>
    {route.v === 'profile' && <ProfileView key={route.username || me.username} me={me} username={route.username || me.username} go={go} />}
    {route.v === 'friends' && <FriendsView go={go} />}
    {route.v === 'discover' && <DiscoverView go={go} />}
  </div>);
}
