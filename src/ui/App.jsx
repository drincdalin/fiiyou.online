import { useCallback, useEffect, useRef, useState } from 'react';
import { auth, admin as adminApi, profiles, cards as cardsApi, friends, wall, social, safety, media, errorCode } from '../index.js';
import { useImages, Boot, Avatar, Rich } from './shared.jsx';
import { toCss } from './customCss.js';
import { Lightbox, ReportModal, Verified, NavIcon, spamMessage } from './parts.jsx';
import ImportModal from './ImportModal.jsx';
import { buildThemeExport, download } from './themeFile.js';
import { HomeView, MapView, MessagesView, PeopleView, PostView } from './views.jsx';
import AdminView from './Admin.jsx';
import { themeStyle } from './theme.js';
import { useCustomFont } from './fonts.js';
import { applyAppTheme } from './appTheme.js';
import Player from './Player.jsx';
import { stickerModel, stickerStyle, withModel, reanchor, nearestAnchor, settleSticker, pinStray, rehome, unitsOf, spansOf } from './stickerAnchor.js';
import Customizer from './Customizer.jsx';
import { ask } from './dialog.jsx';
import ShareSheet from './ShareSheet.jsx';
import { Eye, EyeSlash, Check, DownloadSimple, Heart, PencilSimple, ShareNetwork, SignOut, Trash, UploadSimple, User } from '@phosphor-icons/react';

const BASE = import.meta.env.BASE_URL;
function Auth() {
  const [mode, setMode] = useState('in'); const [f, setF] = useState({ email: '', password: '', username: '', displayName: '' }); const [agree, setAgree] = useState(false); const [banned, setBanned] = useState(false);
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false); const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const say = (m, good = false) => { setMsg(m); setOk(good); };
  const go = async (e) => { e.preventDefault(); say(''); setBusy(true);
    try { if (mode === 'in') await auth.signIn(f); else { const r = await auth.signUp(f); if (!r.session) say('Check your email to confirm your account.', true); } }
    catch (er) { if (er.message === 'banned') setBanned(true); else say(er.message === 'username_taken' ? 'That username is taken.' : er.message); } setBusy(false); };
  const forgot = async () => { if (!f.email) return say('Type your email first.'); try { await auth.resetPassword(f.email); say('If that email has an account, a reset link is on its way.', true); } catch (er) { say(er.message); } };
  const up = mode === 'up'; const [showPw, setShowPw] = useState(false);
  if (banned) return <Banned onBack={() => setBanned(false)} />;
  return (
    <div className="authwrap">
      <form className="authcard" onSubmit={go}>
        <header className="authhead"><h1 className="brand">fiiyou</h1><p className="authlead">The internet belongs to you.</p></header>
        <div className="authtabs" role="tablist" aria-label="Sign in or create an account">
          <button type="button" role="tab" aria-selected={!up} className={!up ? 'on' : ''} onClick={() => { setMode('in'); say(''); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={up} className={up ? 'on' : ''} onClick={() => { setMode('up'); say(''); }}>Create account</button>
        </div>
        {up && <><label className="field"><span>Username</span><input placeholder="a-z, 0-9 and _" value={f.username} onChange={set('username')} required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" autoComplete="username" /></label>
          <label className="field"><span>Display name</span><input placeholder="How people see you" value={f.displayName} onChange={set('displayName')} maxLength={50} /></label></>}
        <label className="field"><span>Email</span><input type="email" placeholder="you@example.com" value={f.email} onChange={set('email')} required autoComplete="email" /></label>
        <label className="field"><span>Password</span><div className="pwbox"><input type={showPw ? 'text' : 'password'} placeholder="8+ characters" value={f.password} onChange={set('password')} required minLength={8} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
          <button type="button" className="pweye" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}>{showPw ? <EyeSlash size={18} weight="bold" aria-hidden="true" /> : <Eye size={18} weight="bold" aria-hidden="true" />}</button></div></label>
        {up && <label className="agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>I am 16 or older and accept the <a href={`${BASE}terms.html`} target="_blank" rel="noopener">Terms</a> and <a href={`${BASE}privacy.html`} target="_blank" rel="noopener">Privacy Policy</a>.</span></label>}
        {msg && <p className={ok ? 'okmsg' : 'err'} role="alert">{msg}</p>}
        <button className="primary wide authgo" disabled={busy || (up && !agree)}>{busy ? 'One moment…' : up ? 'Create account' : 'Sign in'}</button>
        {!up && <button type="button" className="link muted authforgot" onClick={forgot}>Forgot your password?</button>}
        <p className="legal"><a href={`${BASE}privacy.html`} target="_blank" rel="noopener">Privacy</a> · <a href={`${BASE}terms.html`} target="_blank" rel="noopener">Terms</a></p>
      </form>
    </div>
  );
}

/** Shown when the email belongs to an account the operator banned (the database refuses it at sign-up, see spam_and_bans.sql). */
function Banned({ onBack }) {
  return (<div className="authwrap"><div className="authcard" role="alert"><header className="authhead"><h1 className="brand">fiiyou</h1></header>
    <h2>You are banned</h2>
    <p className="muted">Your account was removed by the operator, and this email address can no longer be used to sign up or sign in.</p>
    <p className="muted">If you think this is a mistake, contact the operator of this site.</p>
    <button className="ghost wide" onClick={onBack}>Back</button></div></div>);
}

function NewPassword({ onDone }) {
  const [pw, setPw] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const save = async (e) => { e.preventDefault(); setBusy(true); try { await auth.updatePassword(pw); onDone(); } catch (er) { setMsg(er.message); setBusy(false); } };
  return (<div className="authwrap"><form className="authcard" onSubmit={save}><h1 className="brand">New password</h1><p className="muted">Choose a new password for your account.</p>
    <input type="password" minLength={8} required autoFocus placeholder="new password (8+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
    {msg && <p className="err">{msg}</p>}<button className="primary" disabled={busy}>{busy ? '…' : 'Save password'}</button></form></div>);
}

function Guestbook({ profileId, go, own, meName, notify }) {
  const [rows, setRows] = useState([]); const [body, setBody] = useState(''); const [err, setErr] = useState('');
  const load = () => wall.listWall(profileId).then(setRows); useEffect(() => { load(); }, [profileId]);
  const img = useImages(rows.map((r) => r.author.avatar_path));
  const send = async (e) => { e.preventDefault(); setErr('');
    try { await wall.postOnWall(profileId, body); setBody(''); load(); } catch (er) { setErr(spamMessage(er) || (errorCode(er) === 'rate_limit' ? 'Slow down a bit.' : 'Cannot post here.')); } };
  return (<>
    <form className="inline" onSubmit={send}><input value={body} maxLength={500} onChange={(e) => setBody(e.target.value)} placeholder="Write something…" />
      <button className="primary" disabled={!body.trim()}>Send</button></form>
    {err && <p className="err">{err}</p>}
    {rows.map((r) => (<div className="msg gb" key={r.id}><button className="who" onClick={() => go('profile', r.author.username)} aria-label="Open profile"><Avatar src={img[r.author.avatar_path]} size={38} /></button>
      <div><button className="ulink" onClick={() => go('profile', r.author.username)}><b>{r.author.display_name}</b> <span className="muted">@{r.author.username}</span></button><p><Rich text={r.body} onUser={(u) => go('profile', u)} /></p></div>
      {(own || r.author.username === meName) ? <button className="ghost sm danger" aria-label="Delete message" onClick={() => wall.deleteWallComment(r.id).then(() => { notify('Message deleted'); load(); }).catch((e) => notify(e.message || 'Could not delete', 'err'))}><Trash size={14} weight="bold" aria-hidden="true" /></button> : <span />}</div>))}
  </>);
}

function CardView({ c, d, img, go, openPhoto, own, meName, notify, children }) {
  const body = {
    about: () => <p className="pre"><Rich text={c.content.body} onUser={(u) => go('profile', u)} /></p>, text: () => <p className="pre"><Rich text={c.content.body} onUser={(u) => go('profile', u)} /></p>,
    gallery: () => d.photos.length ? <div className="gal">{d.photos.map((p, i) => img[p.path] && (
      <button key={p.id} className="gtile" onClick={() => openPhoto(i)} aria-label="Open photo"><img src={img[p.path]} alt={p.caption || ''} loading="lazy" />{p.like_count > 0 && <span><Heart size={12} weight="fill" aria-hidden="true" />{p.like_count}</span>}</button>))}</div>
      : <p className="muted">No photos yet.</p>,
    links: () => <ul>{(c.content.links || []).map((l, i) => <li key={i}><a href={l.url} target="_blank" rel="noopener noreferrer nofollow">{l.label}</a></li>)}</ul>,
    interests: () => <div className="tags">{(c.content.interests || []).map((t) => <span key={t}>{t}</span>)}</div>,
    top_friends: () => d.topFriends.length ? <div className="top">{d.topFriends.map((f) => (
      <button key={f.id} className="ghost" onClick={() => go('profile', f.username)}>
        {f.avatar_path && img[f.avatar_path] ? <img src={img[f.avatar_path]} alt="" /> : <i />}<span>{f.display_name}</span></button>))}</div>
      : <p className="muted">No top friends yet.</p>,
    guestbook: () => <Guestbook profileId={d.profile.id} go={go} own={own} meName={meName} notify={notify} />,
  }[c.type];
  return body ? <div className="cw" data-cid={c.id}><section className="card"><h2>{c.title}</h2>{body()}</section>{children}</div> : null;   // children = the stickers pinned to this card
}

const cl = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function Sticker({ c, m, unit, edge, getRoot, src, edit, selected, onSelect, onChange }) {
  // m = { card, v, x, y, w, h } in units (1 unit = 1/1000 of the cards column width), unit = px per unit right now.
  const el = useRef();
  const drag = (e, mode) => {
    if (!edit) return; e.preventDefault(); e.stopPropagation(); onSelect(c.id);
    const sx = e.clientX, sy = e.clientY, o = m, ar = m.w / m.h, dir = m.v === 'b' ? -1 : 1;
    let hot = null; const light = (n) => { if (hot !== n) { hot?.classList.remove('anchor-hot'); n?.classList.add('anchor-hot'); hot = n; } };   // outline the card / avatar it will be pinned to
    const mv = (ev) => { const dx = (ev.clientX - sx) / unit, dy = (ev.clientY - sy) / unit;
      if (mode === 'move') requestAnimationFrame(() => { const root = getRoot(); if (el.current && root) light(nearestAnchor(el.current, root)?.n || null); });
      if (mode === 'move') onChange({ x: cl(Math.round(o.x + dx), -30000, 30000), y: cl(Math.round(o.y + dir * dy), -30000, 30000) });
      else { const w = cl(Math.round(o.w + dx), 40, 1200); onChange({ w, h: cl(Math.round(w / ar), 40, 2000) }); } };
    const up = () => { light(null); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      // dropped: pin it to the card it now sits on, so it follows that card on every screen size
      if (mode === 'move') requestAnimationFrame(() => { const root = getRoot(); const at = el.current && root && reanchor(el.current, root, o, unit); if (at) onChange(at); }); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  };
  return (<div ref={el} data-sid={c.id} data-edge={edge ? '' : undefined} className={`sticker${edit ? ' edit' : ''}${selected ? ' sel' : ''}`} onPointerDown={(e) => drag(e, 'move')} style={stickerStyle(c, m, unit)}>
    {src && <img src={src} alt="" draggable={false} />}{edit && selected && <b className="grip" onPointerDown={(e) => drag(e, 'size')} />}</div>);
}

const makeDraft = (d) => { const profile = d.profile; return { theme: { ...profile.theme }, origBg: profile.theme.bg_image, origFont: profile.theme.font_file, cards: d.cards.map((c) => ({ ...c })), top: d.topFriends.map((f) => f.id), origMusic: profile.music || {}, css: profile.custom_css || [],
  fields: { display_name: profile.display_name, headline: profile.headline, locality_id: profile.locality_id, wall_policy: profile.wall_policy, show_on_map: profile.show_on_map, music: profile.music || {} } }; };

function ProfileView({ username, go, notify, refreshMe, meName, autoEdit }) {
  const [d, setD] = useState(null); const [draft, setDraft] = useState(null); const [sel, setSel] = useState(null); const [colW, setColW] = useState(920); const [avW, setAvW] = useState(190); const cardsRef = useRef(); const avRef = useRef();
  const [collapsed, setCollapsed] = useState(false); const [lb, setLb] = useState(null); const [rep, setRep] = useState(false); const frame = useRef(); const pageRef = useRef(); const [sharing, setSharing] = useState(false); const [shareData, setShareData] = useState(null);
  const load = useCallback(() => profiles.getFullProfile(username).then(setD).catch((e) => notify(e.message, 'err')), [username]);
  useEffect(() => { setD(null); setDraft(null); setSel(null); setLb(null); load(); }, [load]);
  useEffect(() => { const c = cardsRef.current, a = avRef.current; if (!c) return; const upd = () => { setColW(c.clientWidth || 920); setAvW((a && a.clientWidth) || 190); }; const ro = new ResizeObserver(upd); ro.observe(c); if (a) ro.observe(a); upd(); return () => ro.disconnect(); }, [d]);   // widths the sticker units are measured against (cards column, avatar)
  const shown = draft ? draft.cards : d?.cards; const theme = draft ? draft.theme : d?.profile.theme; const music = (draft ? draft.fields.music : d?.profile.music) || {};
  const img = useImages(d ? [d.profile.avatar_path, theme.bg_image, music.cover, ...shown.flatMap((c) => c.content.images || []), ...d.photos.map((p) => p.path), ...d.topFriends.map((f) => f.avatar_path)] : []);
  const fontFamily = useCustomFont(theme?.font_file);   // registers the uploaded font (draft or saved) so the page can use it
  const [audioUrl, setAudioUrl] = useState(null);
  const [spans, setSpans] = useState({});   // width of each anchor in its own units
  const [units, setUnits] = useState({});   // px per sticker unit of every anchor (cards, avatar, name box, player, buttons), re-measured whenever one resizes
  useEffect(() => { const root = frame.current; if (!root) return; const nodes = [root, ...root.querySelectorAll('[data-cid]')];
    const read = () => { const sp = spansOf(root); setSpans((p) => (JSON.stringify(p) === JSON.stringify(sp) ? p : sp)); const n = unitsOf(root); setUnits((p) => { const k = Object.keys(n); return k.length === Object.keys(p).length && k.every((i) => Math.abs((p[i] ?? -1) - n[i]) < 0.0005) ? p : n; }); };
    const ro = new ResizeObserver(read); nodes.forEach((e) => ro.observe(e)); read(); return () => ro.disconnect(); });
  useEffect(() => {   // when editing starts, re-pin every sticker to the card / avatar it visually sits on (what you see is what gets pinned). Skipped on phones: there the layout is not the one it was placed in.
    if (!draft || innerWidth <= 700) return;
    const t = setTimeout(() => { const root = frame.current; if (!root) return; const fix = {};
      for (const c of draft.cards) if (c.type === 'sticker') { const at = settleSticker(c, draft.theme, root); if (at) fix[c.id] = at; }
      if (Object.keys(fix).length) setDraft((x) => ({ ...x, cards: x.cards.map((c) => (fix[c.id] ? { ...c, ...withModel(c, x.theme, fix[c.id]) } : c)) })); }, 400);
    return () => clearTimeout(t);
  }, [!!draft]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {   // one-time repair, owner on a desktop screen: stickers that were never pinned to a card get pinned to the card they sit on, and saved
    if (!d || draft || d.relationship.status !== 'self' || innerWidth <= 1000) return;
    const t = setTimeout(async () => { const root = frame.current; if (!root) return; const fix = [];
      for (const c of d.cards) if (c.type === 'sticker' && c.visible) { const at = (!c.content?.at?.card && pinStray(c, d.profile.theme, root)) || rehome(c, d.profile.theme, root); if (at) fix.push([c, withModel(c, d.profile.theme, at)]); }
      if (!fix.length) return;
      const res = await Promise.allSettled(fix.map(([c, p]) => cardsApi.updateCard(c.id, p)));
      const ok = new Map(fix.filter((_, i) => res[i].status === 'fulfilled').map(([c, p]) => [c.id, p]));
      if (ok.size) setD((x) => ({ ...x, cards: x.cards.map((c) => (ok.has(c.id) ? { ...c, ...ok.get(c.id) } : c)) })); }, 1500);
    return () => clearTimeout(t);
  }, [d]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (autoEdit && d && d.relationship.status === 'self' && !draft) { setCollapsed(false); setDraft(makeDraft(d)); history.replaceState(null, '', `${location.pathname}${location.search}#/me`); } }, [d, autoEdit]);   // "Edit my profile" on Home opens the editor straight away
  useEffect(() => { let on = true; setAudioUrl(null); if (music.audio) media.signedUrl(music.audio, 'audio').then((u) => on && setAudioUrl(u)).catch(() => {}); return () => { on = false; }; }, [music.audio]);
  if (!d) return <Boot />;
  const { profile, relationship: rel } = d; const own = rel.status === 'self';
  const startEdit = () => { setCollapsed(false); setDraft(makeDraft(d)); };
  const patch = (id, p) => setDraft((x) => ({ ...x, cards: x.cards.map((c) => (c.id === id ? { ...c, ...p } : c)) }));
  const patchSticker = (id, p) => setDraft((x) => ({ ...x, cards: x.cards.map((c) => (c.id === id ? { ...c, ...withModel(c, x.theme, p) } : c)) }));
  const act = (fn, msg) => fn().then(() => { notify(msg); load(); }).catch((e) => notify(e.message, 'err'));
  const friendBtn = { none: ['Add friend', () => friends.sendRequest(profile.id), 'Request sent'], pending_sent: ['Cancel request', () => friends.removeFriend(profile.id), 'Request cancelled'],
    pending_received: ['Accept request', () => friends.acceptRequest(rel.id), 'You are now friends'], friends: ['Friends', () => friends.removeFriend(profile.id), 'Friend removed'] }[rel.status];
  const name = draft?.fields.display_name ?? profile.display_name; const headline = draft?.fields.headline ?? profile.headline;
  const items = d.photos.map((p) => ({ id: p.id, src: img[p.path], caption: p.caption, likes: p.like_count, liked: p.liked }));
  // Stickers are rendered inside the card they are pinned to (or at the top of the cards column when that card is hidden / gone / they are not pinned yet).
  const flowShown = shown.filter((c) => c.visible && c.type !== 'music' && c.type !== 'sticker'); const flowIds = new Set(flowShown.map((c) => c.id));
  const stickerList = shown.filter((c) => c.type === 'sticker' && c.visible).map((c) => ({ c, m: stickerModel(c, theme) }));
  const hasPlayer = !!(audioUrl || music.url);
  const rendered = new Set([...flowIds, 'avatar', 'nameplate', 'actions', 'frame', ...(hasPlayer ? ['player'] : [])]);   // anchors that exist on the page; stickers pinned to anything else sit at the top of the cards column
  const stickersOn = (cardId) => stickerList.filter(({ m }) => (cardId ? m.card === cardId : !rendered.has(m.card))).map(({ c, m }) => (
    <Sticker key={c.id} c={c} m={m} unit={units[m.card] || colW / 1000} edge={(m.x + m.w / 2 < 0) || (m.x + m.w / 2 > (spans[m.card] ?? 1000))} getRoot={() => frame.current} src={img[c.content.images?.[0]]} edit={!!draft} selected={sel === c.id} onSelect={setSel} onChange={(p) => patchSticker(c.id, p)} />));
  const openShare = async () => { if (sharing) return; setSharing(true);
    try {
      const flowCards = shown.filter((c) => c.visible && c.type !== 'music' && c.type !== 'sticker');
      const stickers = shown.filter((c) => c.type === 'sticker' && c.visible).map((c) => { const m = stickerModel(c, theme); return { src: img[c.content.images?.[0]], card: m.card, v: m.v, x: m.x, y: m.y, w: m.w, h: m.h, rotation: c.rotation || 0, z: c.z || 0 }; });
      const gb = await wall.listWall(profile.id).catch(() => []);          // always loaded: the "Left on my wall" card needs it even if the guestbook card is hidden
      setShareData({
        slug: profile.username,
        profile: { username: profile.username, display_name: name, headline, locality: profile.locality?.name, verified: !!profile.is_official, friends: d.friendCount, views: d.views },
        theme, fontFamily, customCss: profile.custom_css || [], avatarSrc: img[profile.avatar_path], bgSrc: img[theme.bg_image],   // customCss = the saved Fine-tune rules, drawn on every share image
        music: (music.title || music.artist) ? { title: music.title, artist: music.artist, coverSrc: img[music.cover] } : null,
        cards: flowCards.map(({ id, type, title, content }) => ({ id, type, title, content })),
        photos: d.photos.map((p) => ({ src: img[p.path] })),
        topFriends: d.topFriends.map((f) => ({ name: f.display_name, username: f.username, src: img[f.avatar_path] })),
        guestbook: gb.slice(0, 10).map((r) => ({ name: r.author.display_name, username: r.author.username, body: r.body })),
        stickers });
    } catch (e) { notify('Could not open sharing', 'err'); } finally { setSharing(false); } };
  const likePhoto = async (it) => { const on = !it.liked; const upd = (liked, n) => setD((x) => ({ ...x, photos: x.photos.map((p) => (p.id === it.id ? { ...p, liked, like_count: p.like_count + n } : p)) }));
    upd(on, on ? 1 : -1); try { await social.setPhotoLike(it.id, on); } catch (e) { upd(!on, on ? -1 : 1); notify(e.message, 'err'); } };
  return (
    <>
    <div ref={pageRef} className={`page view${draft ? ' editing' : ''}${draft && collapsed ? ' collapsed' : ''}`} style={{ ...themeStyle(theme, img[theme.bg_image], fontFamily), '--u-cards': `${colW / 1000}px`, '--u-avatar': `${avW / 1000}px` }} onPointerDown={() => draft && setSel(null)}>
      <style>{toCss(draft ? draft.css : profile.custom_css)}</style>
      <div className="dim" />
      <main className="frame" ref={frame} data-cid="frame" data-layout={theme.layout || 'side-left'}>
        <aside className="side">
          <div className="avatar" ref={avRef} data-cid="avatar">{img[profile.avatar_path] ? <img src={img[profile.avatar_path]} alt="" /> : <i />}{stickersOn('avatar')}</div>
          <div className="nameplate" data-cid="nameplate"><h1>{name}{profile.is_official && <Verified />}</h1><small>@{profile.username}{profile.locality ? ` · ${profile.locality.name}` : ''}</small>
            <small className="views">{d.friendCount} friend{d.friendCount === 1 ? '' : 's'} · {d.views} view{d.views === 1 ? '' : 's'}</small>{stickersOn('nameplate')}</div>
          {headline && <p className="headline">{headline}</p>}
          {(audioUrl || music.url) && <Player key={music.audio || music.url} src={audioUrl || music.url} title={music.title} artist={music.artist} cover={img[music.cover]} cid="player">{stickersOn('player')}</Player>}
          {own ? (!draft ? <div className="acw own" data-cid="actions"><button className="primary wide" onClick={startEdit}><PencilSimple size={18} weight="bold" aria-hidden="true" />Customize profile</button><button className="ghost wide" disabled={sharing} onClick={openShare}><ShareNetwork size={18} weight="bold" aria-hidden="true" />{sharing ? 'Loading…' : 'Share profile'}</button>{stickersOn('actions')}</div>
            : <div className="acw" data-cid="actions"><div className="actions preview" aria-hidden="true"><div className="arow"><button className="primary" tabIndex={-1} disabled>Message</button><button className="ghost" tabIndex={-1} disabled>Friends</button></div>
              <div className="safe"><span>Report</span><span>·</span><span>Block</span></div></div>{stickersOn('actions')}</div>) : <div className="acw" data-cid="actions"><div className="actions">
            {rel.status === 'friends' ? <div className="arow">
              <button className="primary" onClick={() => go('messages', null, profile.id)}>Message</button>
              <button className="ghost" title="Click to remove this friend" onClick={async () => (await ask({ title: 'Remove this friend?', message: `${name} will be removed from your friends.`, confirmLabel: 'Remove', danger: true })) && act(friendBtn[1], friendBtn[2])}><Check size={16} weight="bold" aria-hidden="true" />{friendBtn[0]}</button></div>
              : friendBtn && <button className="primary wide" onClick={() => act(friendBtn[1], friendBtn[2])}>{friendBtn[0]}</button>}
            <div className="safe">
              <button className="link" onClick={() => setRep(true)}>Report</button><span aria-hidden="true">·</span>
              <button className="link" onClick={async () => (await ask({ title: 'Block this person?', message: `${name} will no longer be able to interact with you.`, confirmLabel: 'Block', danger: true })) && safety.blockUser(profile.id).then(() => go('people')).catch((e) => notify(e.message || 'Could not block', 'err'))}>Block</button></div></div>{stickersOn('actions')}</div>}
        </aside>
        <div className="divider" />
        <div className="cards" ref={cardsRef}>{flowShown.map((c) => <CardView key={c.id} c={c} d={d} img={img} go={go} openPhoto={setLb} own={own} meName={meName} notify={notify}>{stickersOn(c.id)}</CardView>)}
          {stickersOn(null)}</div>
      {stickersOn('frame')}
      </main>
    </div>
    {draft && <Customizer draft={draft} setDraft={setDraft} onClose={() => setDraft(null)} reload={async () => { await load(); refreshMe(); }} sel={sel} setSel={setSel} notify={notify} photos={d.photos} img={img} collapsed={collapsed} setCollapsed={setCollapsed} />}
    {rep && <ReportModal target={{ type: 'profile', id: profile.id }} onClose={() => setRep(false)} notify={notify} />}
    {shareData && <ShareSheet data={shareData} onClose={() => setShareData(null)} />}
    {lb != null && <Lightbox items={items} index={lb} onClose={() => setLb(null)} onIndex={setLb} onLike={own ? undefined : likePhoto} />}
    </>
  );
}

function parseHash() {
  const path = decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, ''));   // short links: app.fiiyou.online/<username>
  if (!location.hash && path && !path.includes('/') && path !== 'index.html') return { v: 'profile', username: path.toLowerCase() };
  const [a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (a === 'u' && b) return { v: 'profile', username: decodeURIComponent(b).toLowerCase() };
  if (a === 'post' && b) return { v: 'post', id: decodeURIComponent(b) };
  if (a === 'chat') return { v: 'messages', peer: b };
  if (a === 'me') return { v: 'profile', edit: b === 'edit' };
  return { v: ['home', 'map', 'people', 'admin'].includes(a) ? a : 'home' };
}

export default function App() {
  const [session, setSession] = useState(undefined); const [me, setMe] = useState(null); const [route, setRoute] = useState(parseHash);
  const [isAdmin, setIsAdmin] = useState(false); const [recovery, setRecovery] = useState(false); const [importing, setImporting] = useState(false);
  const [menu, setMenu] = useState(false); const [toast, setToast] = useState(null); const [unread, setUnread] = useState(0);
  const refreshMe = useCallback(() => profiles.getMyProfile().then(setMe).catch(() => {}), []);
  const myImg = useImages([me?.avatar_path]);
  const refreshUnread = useCallback(() => social.unreadCount().then(setUnread).catch(() => {}), []);
  useEffect(() => {
    auth.getSession().then(setSession);
    return auth.onAuthChange((sess, ev) => {
      // Keeps the last 30 auth events in localStorage so an unexpected logout leaves evidence (read: localStorage.getItem('auth_log')).
      try {
        const log = JSON.parse(localStorage.getItem('auth_log') || '[]');
        log.push({ t: new Date().toISOString(), ev, has: !!sess });
        localStorage.setItem('auth_log', JSON.stringify(log.slice(-30)));
      } catch {}
      setSession(sess);
      if (ev === 'PASSWORD_RECOVERY') setRecovery(true);
    });
  }, []);
  useEffect(() => { const h = () => setRoute(parseHash()); addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  useEffect(() => { const t = { home: 'Home', profile: route.username ? `@${route.username}` : 'Me', map: 'Map', messages: 'Chat', people: 'People', admin: 'Admin', post: 'Post' }[route.v]; document.title = `fiiyou · ${t}`; }, [route]);
  useEffect(() => { if (session) profiles.getMyProfile().then(setMe).catch(() => {}); else setMe(null); }, [session]);
  useEffect(() => { if (!me) return; refreshUnread(); const t = setInterval(refreshUnread, 30000); const off = social.onMessage(me.id, refreshUnread); return () => { clearInterval(t); off(); }; }, [me?.id]);
  useEffect(() => { if (me?.id) adminApi.isAdmin().then(setIsAdmin).catch(() => setIsAdmin(false)); else setIsAdmin(false); }, [me?.id]);   // display only: the database re-checks every admin call
  useEffect(() => { if (me?.id) media.sweepOrphans().catch(() => {}); }, [me?.id]);   // clears files nothing references any more
  useEffect(() => { applyAppTheme(me?.theme); }, [me?.theme]);   // the whole UI is coloured from the signed-in person's theme (Mono when signed out)
  const menuRef = useRef();
  useEffect(() => { if (!menu) return; const out = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false); }; const esc = (e) => e.key === 'Escape' && setMenu(false);
    addEventListener('pointerdown', out); addEventListener('keydown', esc); return () => { removeEventListener('pointerdown', out); removeEventListener('keydown', esc); }; }, [menu]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3200); return () => clearTimeout(t); }, [toast]);
  if (session === undefined) return <Boot />;
  if (recovery && session) return <NewPassword onDone={() => setRecovery(false)} />;
  if (!session) return <Auth />;
  if (!me) return <Boot />;
  const notify = (msg, type = 'ok') => setToast({ msg, type });
  const go = (v, username, peer, edit) => { const h = v === 'profile' ? (username && username !== me.username ? `#/u/${encodeURIComponent(username)}` : edit ? '#/me/edit' : '#/me') : v === 'messages' ? (peer ? `#/chat/${peer}` : '#/chat') : v === 'post' ? `#/post/${encodeURIComponent(username)}` : `#/${v}`;   // go('post', postId)
    setMenu(false); window.scrollTo(0, 0); if (location.hash === h) setRoute(parseHash()); else location.hash = h; };
  const NAV = [['home', 'Home'], ['profile', 'Me'], ['map', 'Map'], ['messages', 'Chat'], ['people', 'People'], ...(isAdmin ? [['admin', 'Admin']] : [])];
  const active = (v) => (v === 'profile' ? route.v === 'profile' && (!route.username || route.username === me.username) : route.v === v);
  const exportTheme = async () => { try { download('fiiyou-theme.json', buildThemeExport(await profiles.getMyProfile(), await cardsApi.listMine())); notify('Theme exported'); } catch (e) { notify(e.message, 'err'); } };
  return (<div className="app">
    <nav className="nav"><button className="logo" onClick={() => go('home')}>fiiyou</button>
      <div className="navlinks">{NAV.map(([v, l]) => <button key={v} className={active(v) ? 'on' : ''} aria-label={l} title={l} aria-current={active(v) ? 'page' : undefined} onClick={() => go(v)}><NavIcon name={v} active={active(v)} />{v === 'messages' && unread > 0 && <em className="dotb">{unread > 99 ? '99+' : unread}</em>}</button>)}</div>
      <div className="more" ref={menuRef}><button className="avbtn" onClick={() => setMenu(!menu)} aria-label="Account menu"><Avatar src={myImg[me.avatar_path]} size={34} /></button>{menu && <div className="menu" role="menu">
        <button className="mhead" role="menuitem" onClick={() => go('profile')}><Avatar src={myImg[me.avatar_path]} size={44} /><span><b>{me.display_name || me.username}</b><small>@{me.username}</small></span></button>
        <hr className="msep" />
        <button role="menuitem" onClick={() => { setMenu(false); exportTheme(); }}><DownloadSimple size={18} weight="bold" aria-hidden="true" />Export theme</button>
        <button role="menuitem" onClick={() => { setMenu(false); setImporting(true); }}><UploadSimple size={18} weight="bold" aria-hidden="true" />Import theme</button>
        <button role="menuitem" onClick={() => { setMenu(false); auth.exportMyData().then((j) => { download('fiiyou-data.json', j); notify('Data exported'); }).catch((e) => notify(e.message, 'err')); }}><DownloadSimple size={18} weight="bold" aria-hidden="true" />Export my data</button>
        <hr className="msep" />
        <button role="menuitem" onClick={() => { setMenu(false); auth.signOut(); }}><SignOut size={18} weight="bold" aria-hidden="true" />Sign out</button>
        <button role="menuitem" className="danger" onClick={async () => { setMenu(false); if (await ask({ title: 'Delete your account?', message: 'Your account and everything in it will be deleted. This cannot be undone.', confirmLabel: 'Delete account', danger: true })) auth.deleteAccount(); }}><Trash size={18} weight="bold" aria-hidden="true" />Delete account</button></div>}</div></nav>
    {route.v === 'home' && <HomeView me={me} go={go} notify={notify} unread={unread} />}
    {route.v === 'map' && <MapView me={me} go={go} notify={notify} />}
    {route.v === 'messages' && <MessagesView key={route.peer || 'all'} me={me} peer={route.peer} go={go} notify={notify} refreshUnread={refreshUnread} />}
    {route.v === 'admin' && isAdmin && <AdminView go={go} notify={notify} />}
    {route.v === 'people' && <PeopleView me={me} go={go} notify={notify} />}
    {route.v === 'post' && <PostView key={route.id} id={route.id} me={me} go={go} notify={notify} />}
    {route.v === 'profile' && <ProfileView key={route.username || me.username} username={route.username || me.username} go={go} notify={notify} refreshMe={refreshMe} meName={me.username} autoEdit={!!route.edit} />}
    {importing && <ImportModal onClose={() => setImporting(false)} notify={notify} onDone={() => { setImporting(false); refreshMe(); go('profile'); setRoute(parseHash()); }} />}
    {toast && <div className={`toast ${toast.type}`} role="status">{toast.msg}</div>}
  </div>);
}
