import { useEffect, useMemo, useRef, useState } from 'react';
import { House, User, MapPin, ChatCircle, UsersThree, ShieldCheck, Heart, X, CaretLeft, CaretRight, Flag, PencilSimple, Trash, PaperPlaneRight, ImageSquare, CalendarBlank, ShareNetwork, DotsThree, Clock } from '@phosphor-icons/react';
import PostShareModal from './PostShare.jsx';
import { posts, safety } from '../index.js';
import { Avatar, ago, Rich, useImages } from './shared.jsx';
import { ask } from './dialog.jsx';
import Comments from './Comments.jsx';
import MentionInput from './MentionInput.jsx';
import { loadPostDraft, savePostDraft, clearPostDraft } from '../lib/postDraft.js';

/** Friendly text for the database's spam-guard errors (see spam_and_bans.sql). Returns null for any other error. */
export const spamMessage = (er) => {
  const m = `${er?.message || ''} ${er?.details || ''} ${er?.hint || ''}`;
  if (m.includes('rate_limit')) return 'You are posting too fast. Wait a few minutes and try again.';
  if (m.includes('spam_duplicate')) return 'You already posted that. Try saying something new.';
  if (m.includes('spam_links')) return 'Too many links in one message. New accounts cannot post links during their first day.';
  return null;
};

/** Verified checkmark (Instagram style), coloured by the theme accent. */
export function Verified() {
  return (<svg className="vcheck" viewBox="0 0 24 24" role="img" aria-label="Verified" width="1em" height="1em"><title>Verified</title>
    <circle cx="12" cy="12" r="11" fill="#1d9bf0" />
    <path fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M7 12.4l3.4 3.4L17 8.8" /></svg>);
}

/** Pop-up viewer. items: [{id, src, caption, likes, liked}]. Pass onLike to show the like button. */
export function Lightbox({ items, index, onClose, onIndex, onLike, onLikers }) {
  const it = items[index]; const n = items.length; const sx = useRef(null);
  const swipeEnd = (e) => { if (sx.current == null || n < 2) return; const dx = e.clientX - sx.current; sx.current = null; if (Math.abs(dx) > 50) onIndex(dx < 0 ? (index + 1) % n : (index - 1 + n) % n); };
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') onIndex((index + 1) % n); if (e.key === 'ArrowLeft') onIndex((index - 1 + n) % n); };
    addEventListener('keydown', key); document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', key); document.body.style.overflow = ''; };
  }, [index, n]);
  if (!it) return null;
  return (<div className="lb" onClick={onClose} role="dialog" aria-modal="true"><div className="lbin" onClick={(e) => e.stopPropagation()}>
    <button className="lbx ghost" onClick={onClose} aria-label="Close"><X size={18} weight="bold" aria-hidden="true" /></button>
    <div className="lbimg" onPointerDown={(e) => { sx.current = e.clientX; }} onPointerUp={swipeEnd} onPointerCancel={() => { sx.current = null; }}>{n > 1 && <button className="arrow l" onClick={() => onIndex((index - 1 + n) % n)} aria-label="Previous"><CaretLeft size={22} weight="bold" aria-hidden="true" /></button>}
      {it.src ? <img src={it.src} alt={it.caption || ''} /> : <div className="boot">…</div>}
      {n > 1 && <button className="arrow r" onClick={() => onIndex((index + 1) % n)} aria-label="Next"><CaretRight size={22} weight="bold" aria-hidden="true" /></button>}</div>
    <div className="lbfoot">{it.caption && <p>{it.caption}</p>}
      <div className="lbbar">{onLike && <button className={`like${it.liked ? ' on' : ''}`} onClick={() => onLike(it)}><Heart size={16} weight={it.liked ? 'fill' : 'bold'} aria-hidden="true" />{it.likes}</button>}{!onLike && onLikers && it.likes > 0 && <button className="like" onClick={() => onLikers(it)} aria-label={`See who liked (${it.likes})`}><Heart size={16} weight="fill" aria-hidden="true" />{it.likes}</button>}<small>{index + 1} / {n}</small></div></div>
  </div></div>);
}

/** Several photos of one post: swipe (touch), scroll (trackpad), drag or use the arrows (mouse) right inside the post. A tap opens the big viewer. */
function PostImages({ srcs, onOpen }) {
  const box = useRef(null); const down = useRef(null); const dragged = useRef(false); const [i, setI] = useState(0); const n = srcs.length;
  const to = (k) => { const el = box.current; if (el) el.scrollTo({ left: el.clientWidth * Math.max(0, Math.min(n - 1, k)), behavior: 'smooth' }); };
  const onScroll = () => { const el = box.current; if (el && el.clientWidth) setI(Math.round(el.scrollLeft / el.clientWidth)); };
  const key = (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); to(i + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); to(i - 1); } };
  // a mouse cannot swipe, so a drag with the mouse turns the page; touch and trackpads scroll natively
  const pdown = (e) => { dragged.current = false; down.current = e.pointerType === 'mouse' ? e.clientX : null; };
  const pup = (e) => { if (down.current == null) return; const dx = e.clientX - down.current; down.current = null; if (Math.abs(dx) > 40) { dragged.current = true; to(dx < 0 ? i + 1 : i - 1); } };
  return (<div className="pimgs">
    <div className="pslides" ref={box} onScroll={onScroll} onKeyDown={key} onPointerDown={pdown} onPointerUp={pup} onClickCapture={(e) => { if (dragged.current) { e.stopPropagation(); e.preventDefault(); dragged.current = false; } }}
      tabIndex={0} role="group" aria-roledescription="carousel" aria-label={`${n} photos`}>
      {srcs.map((u, k) => <button key={k} type="button" className="pimg pslide" style={u ? { '--bgimg': `url("${u}")` } : undefined} onClick={() => onOpen(k)} aria-label={`Open photo ${k + 1} of ${n}`}>
        {u ? <img src={u} alt="" loading={k ? 'lazy' : undefined} draggable="false" /> : <span className="pslideph" />}</button>)}
    </div>
    {i > 0 && <button type="button" className="pnav l" aria-label="Previous photo" onClick={() => to(i - 1)}><CaretLeft size={18} weight="bold" aria-hidden="true" /></button>}
    {i < n - 1 && <button type="button" className="pnav r" aria-label="Next photo" onClick={() => to(i + 1)}><CaretRight size={18} weight="bold" aria-hidden="true" /></button>}
    <span className="pcount" aria-hidden="true">{i + 1}/{n}</span>
    <div className="pdots" aria-hidden="true">{srcs.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
  </div>);
}

export function PostCard({ p, me, img, go, onChange, onDelete, notify }) {
  const [edit, setEdit] = useState(false); const [body, setBody] = useState(p.body); const [title, setTitle] = useState(p.title || '');
  const [open, setOpen] = useState(false); const [zoom, setZoom] = useState(false); const [rep, setRep] = useState(false); const [shr, setShr] = useState(false); const [menu, setMenu] = useState(false); const [zi, setZi] = useState(0);
  const extra = p.extra_images || []; const xi = useImages(extra); const own = p.author_id === me.id; const fail = (e) => notify(spamMessage(e) || e.message || 'Something went wrong', 'err');
  const like = async () => { const on = !p.liked; onChange({ ...p, liked: on, like_count: p.like_count + (on ? 1 : -1) }); try { await posts.setLike(p.id, on); } catch (e) { onChange(p); fail(e); } };
  const save = async () => { try { const r = await posts.updatePost(p.id, { body, title: p.kind === 'event' ? title : undefined }); onChange({ ...p, body: r.body, title: r.title, edited_at: r.edited_at }); setEdit(false); notify('Post updated'); } catch (e) { fail(e); } };
  const dropImg = async () => { try { await posts.updatePost(p.id, { body: p.body }, { removeImage: true, oldImage: p.image_path, oldExtras: extra }); onChange({ ...p, image_path: null, extra_images: [] }); } catch (e) { fail(e); } };
  const del = async () => { if (!(await ask({ title: 'Delete this post?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return; try { await posts.deletePost(p.id, p.image_path, extra); onDelete(p.id); notify('Post deleted'); } catch (e) { fail(e); } };
  const src = img[p.image_path];
  return (<article className={`post${p.author_official ? ' official' : ''}`}>
    <header><button className="who" onClick={() => go('profile', p.author_username)}><Avatar src={img[p.author_avatar_path]} />
      <span><b>{p.author_display_name}{p.author_official && <Verified />}</b><small>@{p.author_username} · {ago(p.created_at)}{p.edited_at && ' · edited'}</small></span></button>
      {!edit && <div className="pmenuwrap"><button className="ghost pmore" onClick={() => setMenu(!menu)} aria-label="More options" aria-expanded={menu}><DotsThree size={24} weight="bold" aria-hidden="true" /></button>
        {menu && <><div className="pmenuback" onClick={() => setMenu(false)} /><div className="pmenu" role="menu">
          {own ? <><button role="menuitem" onClick={() => { setMenu(false); setEdit(true); }}><PencilSimple size={18} weight="bold" aria-hidden="true" />Edit</button>
            <button role="menuitem" className="danger" onClick={() => { setMenu(false); del(); }}><Trash size={18} weight="bold" aria-hidden="true" />Delete</button></>
            : <button role="menuitem" onClick={() => { setMenu(false); setRep(true); }}><Flag size={18} weight="bold" aria-hidden="true" />Report</button>}</div></>}</div>}</header>
    <div className={`pmain${p.image_path && src ? ' has' : ''}`}>
      {p.image_path && src && (extra.length ? <PostImages srcs={[src, ...extra.map((x) => xi[x])]} onOpen={(k) => { setZi(k); setZoom(true); }} />
        : <button className="pimg" style={{ '--bgimg': `url("${src}")` }} onClick={() => setZoom(true)} aria-label="Open photo"><img src={src} alt="" loading="lazy" /></button>)}
      <div className="ptext">
        {p.kind === 'event' && <div className="evmeta"><CalendarBlank size={14} weight="bold" aria-hidden="true" />{new Date(p.event_at).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })}{p.event_place && ` · ${p.event_place}`}</div>}
        {p.place_name && <div className="chipline"><MapPin size={14} weight="bold" aria-hidden="true" />At {p.place_name}</div>}
        {edit ? (<div className="editbox">{p.kind === 'event' && <input value={title} maxLength={100} placeholder="Title" onChange={(e) => setTitle(e.target.value)} />}
          <MentionInput as="textarea" rows="3" maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="acts"><button className="primary sm" disabled={!body.trim()} onClick={save}>Save</button><button className="ghost sm" onClick={() => { setEdit(false); setBody(p.body); setTitle(p.title || ''); }}>Cancel</button>
            {p.image_path && <button className="ghost sm" onClick={dropImg}>{extra.length ? 'Remove images' : 'Remove image'}</button>}</div></div>)
          : <>{p.title && <h3>{p.title}</h3>}<p className="pre"><Rich plain text={p.body} onUser={(u) => go('profile', u)} onTag={(t) => go('tag', t)} /></p></>}
      </div>
    </div>
    <footer><button className={`like${p.liked ? ' on' : ''}`} onClick={like} aria-label={p.liked ? 'Unlike' : 'Like'}><Heart size={16} weight={p.liked ? 'fill' : 'bold'} aria-hidden="true" />{p.like_count}</button>
      <button className="ghost sm" onClick={() => setOpen(!open)} aria-label="Comments"><ChatCircle size={16} weight="bold" aria-hidden="true" /><span className="lbl">Comments </span>{p.comment_count}</button>
      {p.visibility !== 'friends' && <button className="ghost sm pshare" onClick={() => setShr(true)} aria-label="Share"><ShareNetwork size={16} weight="bold" aria-hidden="true" /><span className="lbl">Share</span></button>}</footer>
    {open && <Comments postId={p.id} postAuthorId={p.author_id} me={me} go={go} notify={notify} fail={fail} onTag={(t) => go('tag', t)}
      onDelta={(d) => onChange({ ...p, comment_count: Math.max(0, p.comment_count + d) })} />}
    {zoom && <Lightbox items={[{ id: p.id, src, caption: p.body }, ...extra.map((x) => ({ id: `${p.id}:${x}`, src: xi[x], caption: p.body }))]} index={zi} onClose={() => setZoom(false)} onIndex={setZi} />}
    {rep && <ReportModal target={{ type: 'post', id: p.id }} onClose={() => setRep(false)} notify={notify} />}
    {shr && <PostShareModal p={p} img={img} onClose={() => setShr(false)} notify={notify} />}
  </article>);
}

/** Likes list: a bottom sheet on phones (swipe down or tap outside to close), a small centred card on desktop.
 *  load() -> [{ id, username, display_name, avatar_path, is_official }], newest like first. Only the owner of the content gets to open it. */
export function LikersModal({ load, go, onClose }) {
  const [rows, setRows] = useState(null); const [err, setErr] = useState(''); const [dy, setDy] = useState(0); const y0 = useRef(null);
  useEffect(() => { let on = true; load().then((r) => on && setRows(r || [])).catch((e) => on && setErr(e.message || 'Could not load the list')); return () => { on = false; }; }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {   // Esc closes only this sheet (not the photo viewer behind it); the viewer's arrow keys are paused while it is open
    const key = (e) => { if (e.key === 'Escape') onClose(); if (['Escape', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { e.stopImmediatePropagation(); e.preventDefault(); } };
    const prev = document.body.style.overflow; addEventListener('keydown', key, true); document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', key, true); document.body.style.overflow = prev; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const img = useImages((rows || []).map((r) => r.avatar_path));
  const down = (e) => { y0.current = e.touches[0].clientY; };
  const move = (e) => { if (y0.current != null) setDy(Math.max(0, e.touches[0].clientY - y0.current)); };
  const up = () => { y0.current = null; if (dy > 90) onClose(); else setDy(0); };
  return (<div className="modal likesheet" onClick={onClose}><div className="panel likepanel" role="dialog" aria-modal="true" aria-label="Likes" onClick={(e) => e.stopPropagation()} style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}>
    <div className="likehead" onTouchStart={down} onTouchMove={move} onTouchEnd={up}><i className="grab" aria-hidden="true" />
      <h3>Likes{rows && rows.length > 0 && <small>{rows.length}</small>}</h3>
      <button className="ghost likex" onClick={onClose} aria-label="Close"><X size={18} weight="bold" aria-hidden="true" /></button></div>
    {err ? <p className="err likemsg">{err}</p> : !rows ? <div className="boot">…</div> : !rows.length ? <p className="muted likemsg">No likes yet.</p>
      : <ul className="likelist">{rows.map((r) => (<li key={r.id}><button className="likerow" onClick={() => { onClose(); go('profile', r.username); }}><Avatar src={img[r.avatar_path]} size={44} />
        <span><b>{r.display_name}{r.is_official && <Verified />}</b><small>@{r.username}</small></span></button></li>))}</ul>}
  </div></div>);
}

export function ReportModal({ target, onClose, notify }) {
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  const send = async (e) => { e.preventDefault(); setBusy(true);
    try { await safety.report(target.type, target.id, reason.trim()); notify('Report sent. Thank you.'); onClose(); }
    catch (er) { notify(er.message?.includes('rate_limit') ? 'Too many reports. Try again later.' : 'Could not send the report.', 'err'); setBusy(false); } };
  return (<div className="modal" onClick={onClose}><form className="panel mform" onClick={(e) => e.stopPropagation()} onSubmit={send}>
    <h3>Report</h3><p className="muted">Tell us what is wrong. Reports are reviewed by the operator.</p>
    <textarea autoFocus required rows="3" maxLength={500} placeholder="What is the problem?" value={reason} onChange={(e) => setReason(e.target.value)} />
    <div className="acts"><button className="primary" disabled={busy || !reason.trim()}>Send report</button><button type="button" className="ghost" onClick={onClose}>Cancel</button></div></form></div>);
}

/** One composer for posts, questions and events. Stays one line until you focus it. fixedPlace = place id when posting from a map place.
 *  Up to 4 photos. The text is kept as a draft in this browser while you type, and "Publish later" schedules the post. */
export function Composer({ me, places = [], fixedPlace = null, onPosted, notify }) {
  const blank = { body: '', kind: 'status', visibility: 'public', place: fixedPlace || '', title: '', when: '', where: '' };
  const scope = fixedPlace ? `place:${fixedPlace}` : 'home';
  const [f, setF] = useState(blank); const [files, setFiles] = useState([]); const [later, setLater] = useState(''); const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false); const [more, setMore] = useState(false); const [restored, setRestored] = useState(false); const [schedVer, setSchedVer] = useState(0);
  const ev = f.kind === 'event'; const set = (k) => (e) => setF({ ...f, [k]: e.target.value }); const expanded = open || f.body || files.length || ev;
  const previews = useMemo(() => files.map((x) => URL.createObjectURL(x)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  useEffect(() => {   // bring back an unfinished draft of this composer
    const d = loadPostDraft(me.id, scope); if (!d) return;
    setF((x) => ({ ...x, ...d, kind: fixedPlace && d.kind === 'event' ? 'status' : d.kind || x.kind, place: fixedPlace || d.place || '' })); setRestored(true); setOpen(true);
  }, [me.id, scope]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => savePostDraft(me.id, scope, f), 400); return () => clearTimeout(t); }, [f, me.id, scope]);
  const addFiles = (e) => { const add = Array.from(e.target.files || []).filter((x) => x.type.startsWith('image/')); e.target.value = ''; setFiles((cur) => [...cur, ...add].slice(0, posts.MAX_IMAGES)); };
  const discard = () => { clearPostDraft(me.id, scope); setF({ ...blank, kind: f.kind, visibility: f.visibility }); setRestored(false); };
  const minLater = () => { const d = new Date(Date.now() + 2 * 60000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const submit = async (e) => { e.preventDefault();
    const when = later ? new Date(later) : null;
    if (when && (Number.isNaN(+when) || +when < Date.now() + 60000)) return notify('Pick a time in the future.', 'err');
    if (when && ev && +when > +new Date(f.when)) return notify('The post should go out before the event starts.', 'err');
    setBusy(true);
    try { const data = { body: f.body, kind: f.kind, title: ev ? f.title : null, eventAt: ev ? new Date(f.when).toISOString() : null, eventPlace: ev ? f.where || null : null,
        visibility: f.visibility, placeId: fixedPlace || f.place || null, localityId: me.locality_id, imageFiles: files };
      if (when) await posts.schedulePost({ ...data, publishAt: when }); else await posts.createPost(data);
      clearPostDraft(me.id, scope); setRestored(false);
      setF({ ...blank, kind: f.kind, visibility: f.visibility }); setFiles([]); setLater(''); setOpen(false);
      if (when) { setSchedVer((v) => v + 1); notify(`Scheduled for ${when.toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })}`); } else { onPosted(); notify(ev ? 'Event published' : 'Posted'); }
    } catch (er) { notify(er.message === 'too_many_scheduled' ? 'You can have up to 20 scheduled posts.' : spamMessage(er) || er.message || 'Could not post', 'err'); } setBusy(false); };
  return (<>
    <form className={`composer panel${expanded ? ' open' : ''}`} onSubmit={submit}>
      {ev && <input placeholder="Event title" maxLength={100} required value={f.title} onChange={set('title')} />}
      <MentionInput as="textarea" rows={expanded ? 3 : 1} maxLength={1000} required placeholder={ev ? 'Details' : f.kind === 'ask' ? 'Ask your neighbours…' : "What's happening?"} value={f.body} onFocus={() => setOpen(true)} onChange={set('body')} />
      {restored && <small className="draftnote">Draft restored. <button type="button" className="link" onClick={discard}>Discard</button></small>}
      {expanded && <>
        {ev && <div className="crow"><input type="datetime-local" required value={f.when} onChange={set('when')} aria-label="When" /><input placeholder="Where (text)" maxLength={120} value={f.where} onChange={set('where')} /></div>}
        {previews.length > 0 && <div className="cthumbs">{previews.map((u, i) => <span key={u} className="cthumb"><img src={u} alt="" /><button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={12} weight="bold" aria-hidden="true" /></button></span>)}</div>}
        {more && <div className="crow">{!fixedPlace && !ev && places.length > 0 && <select value={f.place} onChange={set('place')} aria-label="Place"><option value="">No place</option>{places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          <select value={f.visibility} onChange={set('visibility')} aria-label="Who can see"><option value="public">Everyone</option><option value="friends">Friends only</option></select>
          <label className="laterbox"><Clock size={16} weight="bold" aria-hidden="true" /><span>Publish later</span><input type="datetime-local" min={minLater()} value={later} onChange={(e) => setLater(e.target.value)} aria-label="Publish later" />{later && <button type="button" className="ghost sm" onClick={() => setLater('')}>Now</button>}</label></div>}
        <div className="crow"><label className={`filebtn${files.length >= posts.MAX_IMAGES ? ' off' : ''}`}><ImageSquare size={16} weight="bold" aria-hidden="true" />{files.length ? `Photos ${files.length}/${posts.MAX_IMAGES}` : 'Photo'}<input type="file" accept="image/*" multiple disabled={files.length >= posts.MAX_IMAGES} onChange={addFiles} /></label>
          <select value={f.kind} onChange={set('kind')} aria-label="Type"><option value="status">Post</option><option value="ask">Question</option>{!fixedPlace && <option value="event">Event</option>}</select>
          <button type="button" className="ghost sm" onClick={() => setMore(!more)}>{more ? 'Fewer options' : 'More options'}</button>
          <button className="primary" disabled={busy || !f.body.trim()}>{busy ? (later ? 'Scheduling…' : 'Posting…') : later ? 'Schedule' : ev ? 'Publish' : 'Post'}</button></div></>}
    </form>
    {!fixedPlace && <ScheduledList version={schedVer} notify={notify} />}
  </>);
}

/** "Scheduled (2)": the posts waiting for their time, with a way to cancel each. Only the author ever sees this. */
function ScheduledList({ version, notify }) {
  const [rows, setRows] = useState([]); const [open, setOpen] = useState(false);
  const load = () => posts.listScheduled().then(setRows).catch(() => {});
  useEffect(() => { load(); }, [version]);
  useEffect(() => { addEventListener('fiiyou:published', load); return () => removeEventListener('fiiyou:published', load); }, []);
  if (!rows.length) return null;
  const cancel = async (r) => { if (!(await ask({ title: 'Cancel this scheduled post?', message: 'It will not be published and is deleted.', confirmLabel: 'Cancel post', danger: true }))) return;
    try { await posts.cancelScheduled(r); load(); notify('Scheduled post cancelled'); } catch (e) { notify(e.message || 'Could not cancel', 'err'); } };
  return (<div className="panel schedlist"><button type="button" className="ghost sm" aria-expanded={open} onClick={() => setOpen(!open)}><Clock size={16} weight="bold" aria-hidden="true" />Scheduled ({rows.length})</button>
    {open && <ul>{rows.map((r) => <li key={r.id}><span><b>{new Date(r.publish_at).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })}</b>{(r.image_path ? ' · 📷' : '')}<br /><small>{r.title || r.body.slice(0, 80)}</small></span>
      <button type="button" className="ghost sm danger" onClick={() => cancel(r)}>Cancel</button></li>)}</ul>}</div>);
}

/** Navbar icons (Phosphor; they use currentColor so active/hover colours just work). */
const NAV_ICONS = { home: House, profile: User, map: MapPin, messages: ChatCircle, people: UsersThree, admin: ShieldCheck };
export function NavIcon({ name, active }) {
  const Icon = NAV_ICONS[name];
  return <Icon className="navic" size="1.4em" weight={active ? 'fill' : 'regular'} aria-hidden="true" />;
}
