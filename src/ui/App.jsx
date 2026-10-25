import { useCallback, useEffect, useRef, useState } from 'react';
import { auth, admin as adminApi, profiles, cards as cardsApi, friends, wall, social, safety, media, errorCode } from '../index.js';
import { useImages, Boot, Avatar, Rich } from './shared.jsx';
import { toCss } from './customCss.js';
import { Lightbox, ReportModal } from './parts.jsx';
import ImportModal from './ImportModal.jsx';
import { buildThemeExport, download } from './themeFile.js';
import { HomeView, MapView, MessagesView, PeopleView } from './views.jsx';
import AdminView from './Admin.jsx';
import { themeStyle, appAccent } from './theme.js';
import Player from './Player.jsx';
import Customizer from './Customizer.jsx';

const BASE = import.meta.env.BASE_URL;
function Auth() {
  const [mode, setMode] = useState('in'); const [f, setF] = useState({ email: '', password: '', username: '', displayName: '' }); const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false); const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const say = (m, good = false) => { setMsg(m); setOk(good); };
  const go = async (e) => { e.preventDefault(); say(''); setBusy(true);
    try { if (mode === 'in') await auth.signIn(f); else { const r = await auth.signUp(f); if (!r.session) say('Check your email to confirm your account.', true); } }
    catch (er) { say(er.message === 'username_taken' ? 'That username is taken.' : er.message); } setBusy(false); };
  const forgot = async () => { if (!f.email) return say('Type your email first.'); try { await auth.resetPassword(f.email); say('If that email has an account, a reset link is on its way.', true); } catch (er) { say(er.message); } };
  return (
    <div className="authwrap"><form className="card authcard" onSubmit={go}>
      <h1 className="brand">fiiyou</h1><p className="muted tagline">Your corner of the local web.</p>
      {mode === 'up' && <><input placeholder="username (a-z, 0-9, _)" value={f.username} onChange={set('username')} required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" autoComplete="username" />
        <input placeholder="display name" value={f.displayName} onChange={set('displayName')} maxLength={50} /></>}
      <input type="email" placeholder="email" value={f.email} onChange={set('email')} required autoComplete="email" />
      <input type="password" placeholder="password (8+ characters)" value={f.password} onChange={set('password')} required minLength={8} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
      {mode === 'up' && <label className="agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>I am 16 or older and accept the <a href={`${BASE}terms.html`} target="_blank" rel="noopener">Terms</a> and <a href={`${BASE}privacy.html`} target="_blank" rel="noopener">Privacy Policy</a>.</span></label>}
      {msg && <p className={ok ? 'okmsg' : 'err'}>{msg}</p>}
      <button className="primary" disabled={busy || (mode === 'up' && !agree)}>{busy ? '…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
      {mode === 'in' && <button type="button" className="link muted" onClick={forgot}>Forgot your password?</button>}
      <button type="button" className="ghost" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); say(''); }}>{mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</button>
      <p className="legal"><a href={`${BASE}privacy.html`} target="_blank" rel="noopener">Privacy</a> · <a href={`${BASE}terms.html`} target="_blank" rel="noopener">Terms</a></p>
    </form></div>
  );
}

function NewPassword({ onDone }) {
  const [pw, setPw] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const save = async (e) => { e.preventDefault(); setBusy(true); try { await auth.updatePassword(pw); onDone(); } catch (er) { setMsg(er.message); setBusy(false); } };
  return (<div className="authwrap"><form className="card authcard" onSubmit={save}><h1 className="brand">New password</h1><p className="muted">Choose a new password for your account.</p>
    <input type="password" minLength={8} required autoFocus placeholder="new password (8+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
    {msg && <p className="err">{msg}</p>}<button className="primary" disabled={busy}>{busy ? '…' : 'Save password'}</button></form></div>);
}

function Guestbook({ profileId, go }) {
  const [rows, setRows] = useState([]); const [body, setBody] = useState(''); const [err, setErr] = useState('');
  const load = () => wall.listWall(profileId).then(setRows); useEffect(() => { load(); }, [profileId]);
  const img = useImages(rows.map((r) => r.author.avatar_path));
  const send = async (e) => { e.preventDefault(); setErr('');
    try { await wall.postOnWall(profileId, body); setBody(''); load(); } catch (er) { setErr(errorCode(er) === 'rate_limit' ? 'Slow down a bit.' : 'Cannot post here.'); } };
  return (<>
    <form className="inline" onSubmit={send}><input value={body} maxLength={500} onChange={(e) => setBody(e.target.value)} placeholder="Write something…" />
      <button className="primary" disabled={!body.trim()}>Send</button></form>
    {err && <p className="err">{err}</p>}
    {rows.map((r) => (<div className="msg gb" key={r.id}><button className="who" onClick={() => go('profile', r.author.username)} aria-label="Open profile"><Avatar src={img[r.author.avatar_path]} size={38} /></button>
      <div><button className="ulink" onClick={() => go('profile', r.author.username)}><b>{r.author.display_name}</b> <span className="muted">@{r.author.username}</span></button><p><Rich text={r.body} onUser={(u) => go('profile', u)} /></p></div>
      <button className="ghost sm" onClick={() => wall.deleteWallComment(r.id).then(load).catch(() => {})}>delete</button></div>))}
  </>);
}

function CardView({ c, d, img, go, openPhoto }) {
  const body = {
    about: () => <p className="pre"><Rich text={c.content.body} onUser={(u) => go('profile', u)} /></p>, text: () => <p className="pre"><Rich text={c.content.body} onUser={(u) => go('profile', u)} /></p>,
    gallery: () => d.photos.length ? <div className="gal">{d.photos.map((p, i) => img[p.path] && (
      <button key={p.id} className="gtile" onClick={() => openPhoto(i)} aria-label="Open photo"><img src={img[p.path]} alt={p.caption || ''} loading="lazy" />{p.like_count > 0 && <span>♥ {p.like_count}</span>}</button>))}</div>
      : <p className="muted">No photos yet.</p>,
    links: () => <ul>{(c.content.links || []).map((l, i) => <li key={i}><a href={l.url} target="_blank" rel="noopener noreferrer nofollow">{l.label}</a></li>)}</ul>,
    interests: () => <div className="tags">{(c.content.interests || []).map((t) => <span key={t}>{t}</span>)}</div>,
    top_friends: () => d.topFriends.length ? <div className="top">{d.topFriends.map((f) => (
      <button key={f.id} className="ghost" onClick={() => go('profile', f.username)}>
        {f.avatar_path && img[f.avatar_path] ? <img src={img[f.avatar_path]} alt="" /> : <i />}<span>{f.display_name}</span></button>))}</div>
      : <p className="muted">No top friends yet.</p>,
    guestbook: () => <Guestbook profileId={d.profile.id} go={go} />,
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

function ProfileView({ username, go, notify, refreshMe }) {
  const [d, setD] = useState(null); const [draft, setDraft] = useState(null); const [sel, setSel] = useState(null); const [k, setK] = useState(1);
  const [collapsed, setCollapsed] = useState(false); const [lb, setLb] = useState(null); const [rep, setRep] = useState(false); const frame = useRef();
  const load = useCallback(() => profiles.getFullProfile(username).then(setD).catch((e) => notify(e.message, 'err')), [username]);
  useEffect(() => { setD(null); setDraft(null); setSel(null); setLb(null); load(); }, [load]);
  useEffect(() => { const el = frame.current; if (!el) return; const ro = new ResizeObserver(() => setK(Math.min(1, el.clientWidth / 1210) || 1)); ro.observe(el); return () => ro.disconnect(); }, [d]);
  const shown = draft ? draft.cards : d?.cards; const theme = draft ? draft.theme : d?.profile.theme; const music = (draft ? draft.fields.music : d?.profile.music) || {};
  const img = useImages(d ? [d.profile.avatar_path, theme.bg_image, music.cover, ...shown.flatMap((c) => c.content.images || []), ...d.photos.map((p) => p.path), ...d.topFriends.map((f) => f.avatar_path)] : []);
  const [audioUrl, setAudioUrl] = useState(null);
  useEffect(() => { let on = true; setAudioUrl(null); if (music.audio) media.signedUrl(music.audio, 'audio').then((u) => on && setAudioUrl(u)).catch(() => {}); return () => { on = false; }; }, [music.audio]);
  if (!d) return <Boot />;
  const { profile, relationship: rel } = d; const own = rel.status === 'self';
  const startEdit = () => { setCollapsed(false); setDraft({ theme: { ...profile.theme }, origBg: profile.theme.bg_image, cards: d.cards.map((c) => ({ ...c })), top: d.topFriends.map((f) => f.id), origMusic: profile.music || {}, css: profile.custom_css || [],
    fields: { display_name: profile.display_name, headline: profile.headline, locality_id: profile.locality_id, wall_policy: profile.wall_policy, show_on_map: profile.show_on_map, music: profile.music || {} } }); };
  const patch = (id, p) => setDraft((x) => ({ ...x, cards: x.cards.map((c) => (c.id === id ? { ...c, ...p } : c)) }));
  const act = (fn, msg) => fn().then(() => { notify(msg); load(); }).catch((e) => notify(e.message, 'err'));
  const friendBtn = { none: ['Add friend', () => friends.sendRequest(profile.id), 'Request sent'], pending_sent: ['Cancel request', () => friends.removeFriend(profile.id), 'Request cancelled'],
    pending_received: ['Accept request', () => friends.acceptRequest(rel.id), 'You are now friends'], friends: ['Unfriend', () => friends.removeFriend(profile.id), 'Removed'] }[rel.status];
  const name = draft?.fields.display_name ?? profile.display_name; const headline = draft?.fields.headline ?? profile.headline;
  const items = d.photos.map((p) => ({ id: p.id, src: img[p.path], caption: p.caption, likes: p.like_count, liked: p.liked }));
  const likePhoto = async (it) => { const on = !it.liked; const upd = (liked, n) => setD((x) => ({ ...x, photos: x.photos.map((p) => (p.id === it.id ? { ...p, liked, like_count: p.like_count + n } : p)) }));
    upd(on, on ? 1 : -1); try { await social.setPhotoLike(it.id, on); } catch (e) { upd(!on, on ? -1 : 1); notify(e.message, 'err'); } };
  return (
    <>
    <div className={`page view${draft ? ' editing' : ''}${draft && collapsed ? ' collapsed' : ''}`} style={themeStyle(theme, img[theme.bg_image])} onPointerDown={() => draft && setSel(null)}>
      <style>{toCss(draft ? draft.css : profile.custom_css)}</style>
      <div className="dim" />
      <main className="frame" ref={frame} data-layout={theme.layout || 'side-left'}>
        <aside className="side">
          <div className="avatar">{img[profile.avatar_path] ? <img src={img[profile.avatar_path]} alt="" /> : <i />}</div>
          <div className="nameplate"><h1>{name}{profile.is_official && <em className="badge">Verified</em>}</h1><small>@{profile.username}{profile.locality ? ` · ${profile.locality.name}` : ''}</small>
            <small className="views">{d.friendCount} friend{d.friendCount === 1 ? '' : 's'} · {d.views} view{d.views === 1 ? '' : 's'}</small></div>
          {headline && <p className="headline">{headline}</p>}
          {(audioUrl || music.url) && <Player key={music.audio || music.url} src={audioUrl || music.url} title={music.title} artist={music.artist} cover={img[music.cover]} />}
          {own ? !draft && <button className="primary wide" onClick={startEdit}>Customize profile</button> : <div className="actions">
            {friendBtn && <button className="primary" onClick={() => act(friendBtn[1], friendBtn[2])}>{friendBtn[0]}</button>}
            {rel.status === 'friends' && <button className="ghost" onClick={() => go('messages', null, profile.id)}>Message</button>}
            <button className="ghost" onClick={() => setRep(true)}>Report</button>
            <button className="ghost" onClick={() => confirm('Block this person?') && safety.blockUser(profile.id).then(() => go('people'))}>Block</button></div>}
        </aside>
        <div className="divider" />
        <div className="cards">{shown.filter((c) => c.visible && c.type !== 'music' && c.type !== 'sticker').map((c) => <CardView key={c.id} c={c} d={d} img={img} go={go} openPhoto={setLb} />)}</div>
        {shown.filter((c) => c.type === 'sticker' && c.visible).map((c) => (
          <Sticker key={c.id} c={c} k={k} src={img[c.content.images?.[0]]} edit={!!draft} selected={sel === c.id} onSelect={setSel} onChange={(p) => patch(c.id, p)} />))}
      </main>
    </div>
    {draft && <Customizer draft={draft} setDraft={setDraft} onClose={() => setDraft(null)} reload={async () => { await load(); refreshMe(); }} sel={sel} setSel={setSel} notify={notify} photos={d.photos} img={img} collapsed={collapsed} setCollapsed={setCollapsed} />}
    {rep && <ReportModal target={{ type: 'profile', id: profile.id }} onClose={() => setRep(false)} notify={notify} />}
    {lb != null && <Lightbox items={items} index={lb} onClose={() => setLb(null)} onIndex={setLb} onLike={own ? undefined : likePhoto} />}
    </>
  );
}

function parseHash() {
  const [a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (a === 'u' && b) return { v: 'profile', username: decodeURIComponent(b).toLowerCase() };
  if (a === 'chat') return { v: 'messages', peer: b };
  if (a === 'me') return { v: 'profile' };
  return { v: ['home', 'map', 'people', 'admin'].includes(a) ? a : 'home' };
}

export default function App() {
  const [session, setSession] = useState(undefined); const [me, setMe] = useState(null); const [route, setRoute] = useState(parseHash);
  const [isAdmin, setIsAdmin] = useState(false); const [recovery, setRecovery] = useState(false); const [importing, setImporting] = useState(false);
  const [menu, setMenu] = useState(false); const [toast, setToast] = useState(null); const [unread, setUnread] = useState(0);
  const refreshMe = useCallback(() => profiles.getMyProfile().then(setMe).catch(() => {}), []);
  const myImg = useImages([me?.avatar_path]);
  const refreshUnread = useCallback(() => social.unreadCount().then(setUnread).catch(() => {}), []);
  useEffect(() => { auth.getSession().then(setSession); return auth.onAuthChange((sess, ev) => { setSession(sess); if (ev === 'PASSWORD_RECOVERY') setRecovery(true); }); }, []);
  useEffect(() => { const h = () => setRoute(parseHash()); addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  useEffect(() => { const t = { home: 'Home', profile: route.username ? `@${route.username}` : 'Me', map: 'Map', messages: 'Chat', people: 'People', admin: 'Admin' }[route.v]; document.title = `fiiyou · ${t}`; }, [route]);
  useEffect(() => { if (session) profiles.getMyProfile().then(setMe); else setMe(null); }, [session]);
  useEffect(() => { if (!me) return; refreshUnread(); const t = setInterval(refreshUnread, 30000); const off = social.onMessage(me.id, refreshUnread); return () => { clearInterval(t); off(); }; }, [me?.id]);
  useEffect(() => { if (me?.id) adminApi.isAdmin().then(setIsAdmin); else setIsAdmin(false); }, [me?.id]);   // display only: the database re-checks every admin call
  useEffect(() => { if (me?.id) media.sweepOrphans().catch(() => {}); }, [me?.id]);   // clears files nothing references any more
  const menuRef = useRef();
  useEffect(() => { if (!menu) return; const out = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false); }; const esc = (e) => e.key === 'Escape' && setMenu(false);
    addEventListener('pointerdown', out); addEventListener('keydown', esc); return () => { removeEventListener('pointerdown', out); removeEventListener('keydown', esc); }; }, [menu]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3200); return () => clearTimeout(t); }, [toast]);
  if (session === undefined) return <Boot />;
  if (recovery && session) return <NewPassword onDone={() => setRecovery(false)} />;
  if (!session) return <Auth />;
  if (!me) return <Boot />;
  const notify = (msg, type = 'ok') => setToast({ msg, type });
  const go = (v, username, peer) => { const h = v === 'profile' ? (username && username !== me.username ? `#/u/${encodeURIComponent(username)}` : '#/me') : v === 'messages' ? (peer ? `#/chat/${peer}` : '#/chat') : `#/${v}`;
    setMenu(false); window.scrollTo(0, 0); if (location.hash === h) setRoute(parseHash()); else location.hash = h; };
  const NAV = [['home', 'Home'], ['profile', 'Me'], ['map', 'Map'], ['messages', 'Chat'], ['people', 'People'], ...(isAdmin ? [['admin', 'Admin']] : [])];
  const active = (v) => (v === 'profile' ? route.v === 'profile' && (!route.username || route.username === me.username) : route.v === v);
  const exportTheme = async () => { try { download('fiiyou-theme.json', buildThemeExport(await profiles.getMyProfile(), await cardsApi.listMine())); notify('Theme exported'); } catch (e) { notify(e.message, 'err'); } };
  return (<div className="app" style={appAccent(me.theme?.accent_color)}>
    <nav className="nav"><button className="logo" onClick={() => go('home')}>fiiyou</button>
      <div className="navlinks">{NAV.map(([v, l]) => <button key={v} className={active(v) ? 'on' : ''} onClick={() => go(v)}>{l}{v === 'messages' && unread > 0 && <em className="dotb">{unread}</em>}</button>)}</div>
      <div className="more" ref={menuRef}><button className="avbtn" onClick={() => setMenu(!menu)} aria-label="Account menu"><Avatar src={myImg[me.avatar_path]} size={34} /></button>{menu && <div className="menu">
        <button onClick={() => go('profile')}>My profile</button>
        <button onClick={exportTheme}>Export my theme</button>
        <button onClick={() => { setMenu(false); setImporting(true); }}>Import a theme</button>
        <button onClick={() => auth.exportMyData().then((j) => { download('fiiyou-data.json', j); notify('Data exported'); }).catch((e) => notify(e.message, 'err'))}>Export all my data</button>
        <button onClick={() => auth.signOut()}>Sign out</button>
        <button className="danger" onClick={() => confirm('Delete your account and everything in it? This cannot be undone.') && auth.deleteAccount()}>Delete account</button></div>}</div></nav>
    {route.v === 'home' && <HomeView me={me} go={go} notify={notify} unread={unread} />}
    {route.v === 'map' && <MapView me={me} go={go} notify={notify} />}
    {route.v === 'messages' && <MessagesView key={route.peer || 'all'} me={me} peer={route.peer} go={go} notify={notify} refreshUnread={refreshUnread} />}
    {route.v === 'admin' && isAdmin && <AdminView go={go} notify={notify} />}
    {route.v === 'people' && <PeopleView me={me} go={go} notify={notify} />}
    {route.v === 'profile' && <ProfileView key={route.username || me.username} username={route.username || me.username} go={go} notify={notify} refreshMe={refreshMe} />}
    {importing && <ImportModal onClose={() => setImporting(false)} notify={notify} onDone={() => { setImporting(false); refreshMe(); go('profile'); setRoute(parseHash()); }} />}
    {toast && <div className={`toast ${toast.type}`} role="status">{toast.msg}</div>}
  </div>);
}
