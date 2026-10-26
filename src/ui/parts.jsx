import { useEffect, useState } from 'react';
import { House, User, MapPin, ChatCircle, UsersThree, ShieldCheck } from '@phosphor-icons/react';
import { posts, safety } from '../index.js';
import { Avatar, ago, Rich } from './shared.jsx';

/** Blue verified checkmark (Instagram style). */
export function Verified() {
  return (<svg className="vcheck" viewBox="0 0 24 24" role="img" aria-label="Verified" width="1em" height="1em"><title>Verified</title>
    <circle cx="12" cy="12" r="11" fill="#0095f6" />
    <path fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M7 12.4l3.4 3.4L17 8.8" /></svg>);
}

/** Pop-up viewer. items: [{id, src, caption, likes, liked}]. Pass onLike to show the like button. */
export function Lightbox({ items, index, onClose, onIndex, onLike }) {
  const it = items[index]; const n = items.length;
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') onIndex((index + 1) % n); if (e.key === 'ArrowLeft') onIndex((index - 1 + n) % n); };
    addEventListener('keydown', key); document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', key); document.body.style.overflow = ''; };
  }, [index, n]);
  if (!it) return null;
  return (<div className="lb" onClick={onClose} role="dialog" aria-modal="true"><div className="lbin" onClick={(e) => e.stopPropagation()}>
    <button className="lbx ghost" onClick={onClose} aria-label="Close">✕</button>
    <div className="lbimg">{n > 1 && <button className="arrow l" onClick={() => onIndex((index - 1 + n) % n)} aria-label="Previous">‹</button>}
      {it.src ? <img src={it.src} alt={it.caption || ''} /> : <div className="boot">…</div>}
      {n > 1 && <button className="arrow r" onClick={() => onIndex((index + 1) % n)} aria-label="Next">›</button>}</div>
    <div className="lbfoot">{it.caption && <p>{it.caption}</p>}
      <div className="lbbar">{onLike && <button className={`like${it.liked ? ' on' : ''}`} onClick={() => onLike(it)}>{it.liked ? '♥' : '♡'} {it.likes}</button>}<small>{index + 1} / {n}</small></div></div>
  </div></div>);
}

export function PostCard({ p, me, img, go, onChange, onDelete, notify }) {
  const [edit, setEdit] = useState(false); const [body, setBody] = useState(p.body); const [title, setTitle] = useState(p.title || '');
  const [open, setOpen] = useState(false); const [cs, setCs] = useState(null); const [txt, setTxt] = useState(''); const [zoom, setZoom] = useState(false); const [rep, setRep] = useState(false);
  const own = p.author_id === me.id; const fail = (e) => notify(e.message || 'Something went wrong', 'err');
  const like = async () => { const on = !p.liked; onChange({ ...p, liked: on, like_count: p.like_count + (on ? 1 : -1) }); try { await posts.setLike(p.id, on); } catch (e) { onChange(p); fail(e); } };
  const save = async () => { try { const r = await posts.updatePost(p.id, { body, title: p.kind === 'event' ? title : undefined }); onChange({ ...p, body: r.body, title: r.title, edited_at: r.edited_at }); setEdit(false); notify('Post updated'); } catch (e) { fail(e); } };
  const dropImg = async () => { try { await posts.updatePost(p.id, { body: p.body }, { removeImage: true, oldImage: p.image_path }); onChange({ ...p, image_path: null }); } catch (e) { fail(e); } };
  const del = async () => { if (!confirm('Delete this post?')) return; try { await posts.deletePost(p.id, p.image_path); onDelete(p.id); notify('Post deleted'); } catch (e) { fail(e); } };
  const toggle = async () => { setOpen(!open); if (!open && !cs) setCs(await posts.listComments(p.id).catch(() => [])); };
  const send = async (e) => { e.preventDefault(); try { await posts.addComment(p.id, txt); setTxt(''); setCs(await posts.listComments(p.id)); onChange({ ...p, comment_count: p.comment_count + 1 }); } catch (er) { fail(er); } };
  const src = img[p.image_path];
  return (<article className={`post${p.author_official ? ' official' : ''}`}>
    <header><button className="who" onClick={() => go('profile', p.author_username)}><Avatar src={img[p.author_avatar_path]} />
      <span><b>{p.author_display_name}{p.author_official && <Verified />}</b><small>@{p.author_username} · {ago(p.created_at)}{p.edited_at && ' · edited'}</small></span></button>
      {!own && <span className="pa"><button className="ghost sm" onClick={() => setRep(true)}>Report</button></span>}
      {own && !edit && <span className="pa"><button className="ghost sm" onClick={() => setEdit(true)}>Edit</button><button className="ghost sm" onClick={del}>Delete</button></span>}</header>
    <div className={`pmain${p.image_path && src ? ' has' : ''}`}>
      {p.image_path && src && <button className="pimg" style={{ '--bgimg': `url("${src}")` }} onClick={() => setZoom(true)} aria-label="Open photo"><img src={src} alt="" loading="lazy" /></button>}
      <div className="ptext">
        {p.kind === 'event' && <div className="evmeta">{new Date(p.event_at).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })}{p.event_place && ` · ${p.event_place}`}</div>}
        {p.place_name && <div className="chipline">At {p.place_name}</div>}
        {edit ? (<div className="editbox">{p.kind === 'event' && <input value={title} maxLength={100} placeholder="Title" onChange={(e) => setTitle(e.target.value)} />}
          <textarea rows="3" maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="acts"><button className="primary sm" disabled={!body.trim()} onClick={save}>Save</button><button className="ghost sm" onClick={() => { setEdit(false); setBody(p.body); setTitle(p.title || ''); }}>Cancel</button>
            {p.image_path && <button className="ghost sm" onClick={dropImg}>Remove image</button>}</div></div>)
          : <>{p.title && <h3>{p.title}</h3>}<p className="pre"><Rich text={p.body} onUser={(u) => go('profile', u)} /></p></>}
      </div>
    </div>
    <footer><button className={`like${p.liked ? ' on' : ''}`} onClick={like}>{p.liked ? '♥' : '♡'} {p.like_count}</button>
      <button className="ghost sm" onClick={toggle}>Comments {p.comment_count}</button></footer>
    {open && <div className="comments">{(cs || []).map((c) => (<div key={c.id} className="cm"><span><button className="ulink" onClick={() => go('profile', c.author.username)}><b>{c.author.display_name}</b></button> <Rich text={c.body} onUser={(u) => go('profile', u)} /></span>
      {(c.author.id === me.id || own) && <button className="ghost sm" aria-label="Delete comment" onClick={async () => { try { await posts.deleteComment(c.id); setCs(cs.filter((x) => x.id !== c.id)); onChange({ ...p, comment_count: p.comment_count - 1 }); } catch (e) { fail(e); } }}>✕</button>}</div>))}
      <form className="inline" onSubmit={send}><input value={txt} maxLength={500} placeholder="Write a comment…" onChange={(e) => setTxt(e.target.value)} /><button className="primary sm" disabled={!txt.trim()}>Send</button></form></div>}
    {zoom && <Lightbox items={[{ id: p.id, src, caption: p.body }]} index={0} onClose={() => setZoom(false)} onIndex={() => {}} />}
    {rep && <ReportModal target={{ type: 'post', id: p.id }} onClose={() => setRep(false)} notify={notify} />}
  </article>);
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

/** One composer for posts, questions and events. Stays one line until you focus it. fixedPlace = place id when posting from a map place. */
export function Composer({ me, places = [], fixedPlace = null, onPosted, notify }) {
  const blank = { body: '', kind: 'status', visibility: 'public', place: fixedPlace || '', title: '', when: '', where: '' };
  const [f, setF] = useState(blank); const [file, setFile] = useState(null); const [busy, setBusy] = useState(false); const [open, setOpen] = useState(false); const [more, setMore] = useState(false);
  const ev = f.kind === 'event'; const set = (k) => (e) => setF({ ...f, [k]: e.target.value }); const expanded = open || f.body || file || ev;
  const submit = async (e) => { e.preventDefault(); setBusy(true);
    try { await posts.createPost({ body: f.body, kind: f.kind, title: ev ? f.title : null, eventAt: ev ? new Date(f.when).toISOString() : null, eventPlace: ev ? f.where || null : null,
        visibility: f.visibility, placeId: fixedPlace || f.place || null, localityId: me.locality_id, imageFile: file });
      setF({ ...blank, kind: f.kind, visibility: f.visibility }); setFile(null); setOpen(false); e.target.reset?.(); onPosted(); notify(ev ? 'Event published' : 'Posted'); } catch (er) { notify(er.message || 'Could not post', 'err'); } setBusy(false); };
  return (<form className={`composer panel${expanded ? ' open' : ''}`} onSubmit={submit}>
    {ev && <input placeholder="Event title" maxLength={100} required value={f.title} onChange={set('title')} />}
    <textarea rows={expanded ? 3 : 1} maxLength={1000} required placeholder={ev ? 'Details' : f.kind === 'ask' ? 'Ask your neighbours…' : "What's happening?"} value={f.body} onFocus={() => setOpen(true)} onChange={set('body')} />
    {expanded && <>
      {ev && <div className="crow"><input type="datetime-local" required value={f.when} onChange={set('when')} aria-label="When" /><input placeholder="Where (text)" maxLength={120} value={f.where} onChange={set('where')} /></div>}
      {more && <div className="crow">{!fixedPlace && !ev && places.length > 0 && <select value={f.place} onChange={set('place')} aria-label="Place"><option value="">No place</option>{places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        <select value={f.visibility} onChange={set('visibility')} aria-label="Who can see"><option value="public">Everyone</option><option value="friends">Friends only</option></select></div>}
      <div className="crow"><label className="filebtn">Photo<input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0] || null)} /></label>{file && <small className="fname">{file.name}</small>}
        <select value={f.kind} onChange={set('kind')} aria-label="Type"><option value="status">Post</option><option value="ask">Question</option>{!fixedPlace && <option value="event">Event</option>}</select>
        <button type="button" className="ghost sm" onClick={() => setMore(!more)}>{more ? 'Fewer options' : 'More options'}</button>
        <button className="primary" disabled={busy || !f.body.trim()}>{busy ? 'Posting…' : ev ? 'Publish' : 'Post'}</button></div></>}
  </form>);
}

/** Navbar icons (Phosphor; they use currentColor so active/hover colours just work). */
const NAV_ICONS = { home: House, profile: User, map: MapPin, messages: ChatCircle, people: UsersThree, admin: ShieldCheck };
export function NavIcon({ name, active }) {
  const Icon = NAV_ICONS[name];
  return <Icon className="navic" size="1.4em" weight={active ? 'fill' : 'regular'} aria-hidden="true" />;
}
