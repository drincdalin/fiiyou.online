import { useEffect, useState } from 'react';
import { posts, discover } from '../index.js';
import { Avatar, ago } from './shared.jsx';

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
  const [open, setOpen] = useState(false); const [cs, setCs] = useState(null); const [txt, setTxt] = useState(''); const [zoom, setZoom] = useState(false);
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
      <span><b>{p.author_display_name}{p.author_official && <em className="badge">Official</em>}</b><small>@{p.author_username} · {ago(p.created_at)}{p.edited_at && ' · edited'}</small></span></button>
      {own && !edit && <span className="pa"><button className="ghost sm" onClick={() => setEdit(true)}>Edit</button><button className="ghost sm" onClick={del}>Delete</button></span>}</header>
    {p.kind === 'event' && <div className="evmeta">{new Date(p.event_at).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })}{p.event_place && ` · ${p.event_place}`}</div>}
    {p.place_name && <div className="chipline">At {p.place_name}</div>}
    {edit ? (<div className="editbox">{p.kind === 'event' && <input value={title} maxLength={100} placeholder="Title" onChange={(e) => setTitle(e.target.value)} />}
      <textarea rows="3" maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="acts"><button className="primary sm" disabled={!body.trim()} onClick={save}>Save</button><button className="ghost sm" onClick={() => { setEdit(false); setBody(p.body); setTitle(p.title || ''); }}>Cancel</button>
        {p.image_path && <button className="ghost sm" onClick={dropImg}>Remove image</button>}</div></div>)
      : <>{p.title && <h3>{p.title}</h3>}<p className="pre">{p.body}</p></>}
    {p.image_path && src && <button className="pimg" onClick={() => setZoom(true)}><img src={src} alt="" loading="lazy" /></button>}
    <footer><button className={`like${p.liked ? ' on' : ''}`} onClick={like}>{p.liked ? '♥' : '♡'} {p.like_count}</button>
      <button className="ghost sm" onClick={toggle}>Comments {p.comment_count}</button></footer>
    {open && <div className="comments">{(cs || []).map((c) => (<div key={c.id} className="cm"><span><b>{c.author.display_name}</b> {c.body}</span>
      {(c.author.id === me.id || own) && <button className="ghost sm" aria-label="Delete comment" onClick={async () => { try { await posts.deleteComment(c.id); setCs(cs.filter((x) => x.id !== c.id)); onChange({ ...p, comment_count: p.comment_count - 1 }); } catch (e) { fail(e); } }}>✕</button>}</div>))}
      <form className="inline" onSubmit={send}><input value={txt} maxLength={500} placeholder="Write a comment…" onChange={(e) => setTxt(e.target.value)} /><button className="primary sm" disabled={!txt.trim()}>Send</button></form></div>}
    {zoom && <Lightbox items={[{ id: p.id, src, caption: p.body }]} index={0} onClose={() => setZoom(false)} onIndex={() => {}} />}
  </article>);
}

/** Status / question composer. fixedPlace = place id when posting from a map place. */
export function Composer({ me, places = [], fixedPlace = null, onPosted, notify }) {
  const [f, setF] = useState({ body: '', kind: 'status', visibility: 'public', place: fixedPlace || '' }); const [file, setFile] = useState(null); const [busy, setBusy] = useState(false);
  const submit = async (e) => { e.preventDefault(); setBusy(true);
    try { await posts.createPost({ body: f.body, kind: f.kind, visibility: f.visibility, placeId: f.place || null, localityId: me.locality_id, imageFile: file });
      setF({ ...f, body: '' }); setFile(null); e.target.reset?.(); onPosted(); notify('Posted'); } catch (er) { notify(er.message || 'Could not post', 'err'); } setBusy(false); };
  return (<form className="composer panel" onSubmit={submit}>
    <textarea rows="2" maxLength={1000} placeholder={f.kind === 'ask' ? 'Ask your neighbours…' : "What's happening?"} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
    <div className="crow"><label className="filebtn">Photo<input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0] || null)} /></label>{file && <small>{file.name}</small>}
      <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="status">Post</option><option value="ask">Question</option></select>
      {!fixedPlace && places.length > 0 && <select value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })}><option value="">No place</option>{places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
      <select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })}><option value="public">Everyone</option><option value="friends">Friends</option></select>
      <button className="primary" disabled={busy || !f.body.trim()}>{busy ? 'Posting…' : 'Post'}</button></div></form>);
}

export function EventComposer({ me, onPosted, notify }) {
  const [f, setF] = useState({ title: '', body: '', when: '', place: '' }); const [file, setFile] = useState(null); const [busy, setBusy] = useState(false);
  const submit = async (e) => { e.preventDefault(); setBusy(true);
    try { await posts.createPost({ kind: 'event', title: f.title, body: f.body, eventAt: new Date(f.when).toISOString(), eventPlace: f.place || null, localityId: me.locality_id, imageFile: file });
      setF({ title: '', body: '', when: '', place: '' }); setFile(null); e.target.reset?.(); onPosted(); notify('Event published'); } catch (er) { notify(er.message || 'Could not publish', 'err'); } setBusy(false); };
  return (<form className="composer panel" onSubmit={submit}>
    <input placeholder="Event title" maxLength={100} required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
    <textarea rows="3" maxLength={1000} placeholder="Details" required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
    <div className="crow"><input type="datetime-local" required value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} />
      <input placeholder="Where (text)" maxLength={120} value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} />
      <label className="filebtn">Image<input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0] || null)} /></label>{file && <small>{file.name}</small>}
      <button className="primary" disabled={busy}>{busy ? 'Publishing…' : 'Publish'}</button></div></form>);
}
