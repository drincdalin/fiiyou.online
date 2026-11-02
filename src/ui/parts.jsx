import { useEffect, useMemo, useRef, useState } from 'react';
import { House, User, MapPin, ChatCircle, UsersThree, ShieldCheck, Heart, X, CaretLeft, CaretRight, Flag, PencilSimple, Trash, PaperPlaneRight, ImageSquare, CalendarBlank, ShareNetwork, DotsThree, Clock } from '@phosphor-icons/react';
import PostShareModal from './PostShare.jsx';
import { posts, safety } from '../index.js';
import { Avatar, ago, Rich, useImages, FadeImg, fullDate, reducedMotion } from './shared.jsx';
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

/** Pop-up viewer. items: [{id, src, caption, likes, liked}]. Pass onLike to show the like button.
 *  Arrow keys, the side buttons, the thumbnails or a swipe move between photos; Esc, a tap outside or a swipe down closes;
 *  a double-click (or double-tap) likes; the next photos are preloaded; focus stays inside and goes back to where it was on close. */
export function Lightbox({ items, index, onClose, onIndex, onLike, onLikers }) {
  const n = items.length; const it = items[index];
  const root = useRef(null); const start = useRef(null); const strip = useRef(null); const opener = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const [dy, setDy] = useState(0); const [dir, setDir] = useState(0); const [more, setMore] = useState(false); const [burst, setBurst] = useState(0);
  const step = (d) => { if (n < 2) return; setDir(d); setMore(false); onIndex((index + d + n) % n); };
  const jump = (k) => { if (k === index || k < 0 || k >= n) return; setDir(k > index ? 1 : -1); setMore(false); onIndex(k); };
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'Home' && n > 1) { e.preventDefault(); jump(0); } else if (e.key === 'End' && n > 1) { e.preventDefault(); jump(n - 1); }
      else if (e.key === 'Tab' && root.current) {   // keep Tab inside the viewer
        const a = document.activeElement; if (a !== document.body && !root.current.contains(a)) return;
        const f = [...root.current.querySelectorAll('button:not([disabled])')]; if (!f.length) return;
        if (e.shiftKey && (a === f[0] || a === document.body)) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, [index, n]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {   // lock the page behind, move focus in, and give it back on close
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; const op = opener.current;
    root.current?.querySelector('.lbx')?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = prev; if (op && document.contains(op)) op.focus?.({ preventScroll: true }); };
  }, []);
  const srcKey = items.map((x) => x.src || '').join('|');
  useEffect(() => {   // preload the photos you are most likely to open next
    if (n < 2) return; [1, -1, 2].forEach((d) => { const s = items[(index + d + n) % n]?.src; if (s) { const im = new Image(); im.decoding = 'async'; im.src = s; } });
  }, [index, n, srcKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {   // keep the active thumbnail in view
    const el = strip.current?.children[index]; if (el?.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [index]);
  const pdown = (e) => { if (e.target.closest('button')) return; start.current = { x: e.clientX, y: e.clientY, t: e.pointerType }; };
  const pmove = (e) => { const s = start.current; if (!s || s.t === 'mouse') return; const d = e.clientY - s.y; if (d > 8 && d > Math.abs(e.clientX - s.x)) setDy(d); };
  const pend = (e) => {
    const s = start.current; start.current = null; if (!s) return; const dx = e.clientX - s.x; const d = e.clientY - s.y;
    if (s.t !== 'mouse' && d > 110 && d > Math.abs(dx)) { onClose(); return; }
    setDy(0); if (n > 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(d)) step(dx < 0 ? 1 : -1);
  };
  const pcancel = () => { start.current = null; setDy(0); };
  const dbl = () => { if (onLike && it && !it.liked) { onLike(it); setBurst((b) => b + 1); } };   // double-click only ever adds a like, so it can never undo one by accident
  if (!it) return null;
  const cap = it.caption || ''; const long = cap.length > 140 || cap.split('\n').length > 2;
  return (<div className="lb" ref={root} onClick={onClose} role="dialog" aria-modal="true" aria-label={n > 1 ? `Photo ${index + 1} of ${n}` : 'Photo'}>
    <div className="lbin" onClick={(e) => e.stopPropagation()} style={dy ? { transform: `translateY(${dy}px)`, opacity: 1 - Math.min(0.6, dy / 420), transition: 'none' } : undefined}>
      <button className="lbx ghost" onClick={onClose} aria-label="Close"><X size={18} weight="bold" aria-hidden="true" /></button>
      <div className="lbimg" onPointerDown={pdown} onPointerMove={pmove} onPointerUp={pend} onPointerCancel={pcancel} onDoubleClick={dbl} title={onLike && !it.liked ? 'Double-click to like' : undefined}>
        {n > 1 && <button className="arrow l" onClick={() => step(-1)} aria-label="Previous photo"><CaretLeft size={22} weight="bold" aria-hidden="true" /></button>}
        {it.src ? <FadeImg key={it.id} className={`lbpic${dir > 0 ? ' fromr' : dir < 0 ? ' froml' : ''}`} src={it.src} alt={n > 1 ? `Photo ${index + 1} of ${n}` : 'Photo'} draggable="false" /> : <div className="lbspin" role="status" aria-label="Loading photo" />}
        {burst > 0 && <Heart key={burst} className="lbheart" size={96} weight="fill" aria-hidden="true" />}
        {n > 1 && <button className="arrow r" onClick={() => step(1)} aria-label="Next photo"><CaretRight size={22} weight="bold" aria-hidden="true" /></button>}</div>
      {n > 1 && n <= 12 && <div className="lbthumbs" ref={strip} role="group" aria-label="All photos">{items.map((x, k) => <button key={x.id} type="button" className={k === index ? 'on' : ''} aria-label={`Photo ${k + 1} of ${n}`} aria-current={k === index ? 'true' : undefined} onClick={() => jump(k)}>{x.src ? <img src={x.src} alt="" draggable="false" /> : <i />}</button>)}</div>}
      <div className="lbfoot">{cap && <p className={`lbcap${long && !more ? ' clamp' : ''}`}>{cap}</p>}{cap && long && <button type="button" className="lbmore" onClick={() => setMore(!more)} aria-expanded={more}>{more ? 'Show less' : 'Show more'}</button>}
        <div className="lbbar">{onLike && <button className={`like${it.liked ? ' on' : ''}`} onClick={() => onLike(it)} aria-pressed={!!it.liked} aria-label={it.liked ? 'Unlike' : 'Like'}><Heart size={16} weight={it.liked ? 'fill' : 'bold'} aria-hidden="true" />{it.likes}</button>}{!onLike && onLikers && it.likes > 0 && <button className="like" onClick={() => onLikers(it)} aria-label={`See who liked (${it.likes})`}><Heart size={16} weight="fill" aria-hidden="true" />{it.likes}</button>}<small>{index + 1} / {n}</small></div></div>
      <span className="sronly" aria-live="polite">{n > 1 ? `Photo ${index + 1} of ${n}` : ''}</span>
    </div></div>);
}

/** Several photos of one post. Desktop: previous / next buttons appear when you hover (or focus) the photos, the mouse can drag, arrow keys work.
 *  Touch and trackpads swipe natively. Dots jump to a photo. A tap on a photo opens the big viewer. Ends do not wrap, so the buttons simply hide there. */
function PostImages({ srcs, onOpen }) {
  const box = useRef(null); const down = useRef(null); const dragged = useRef(false); const raf = useRef(0); const [i, setI] = useState(0); const iRef = useRef(0); const n = srcs.length; iRef.current = i;
  const to = (k) => { const el = box.current; if (el) el.scrollTo({ left: el.clientWidth * Math.max(0, Math.min(n - 1, k)), behavior: reducedMotion() ? 'auto' : 'smooth' }); };
  const onScroll = () => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(() => { const el = box.current; if (el && el.clientWidth) setI(Math.round(el.scrollLeft / el.clientWidth)); }); };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => {   // a resized window or a rotated phone keeps the same photo in view
    const el = box.current; if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => { if (iRef.current) el.scrollTo({ left: el.clientWidth * iRef.current, behavior: 'auto' }); }); ro.observe(el); return () => ro.disconnect();
  }, []);
  const key = (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); to(i + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); to(i - 1); } else if (e.key === 'Home') { e.preventDefault(); to(0); } else if (e.key === 'End') { e.preventDefault(); to(n - 1); } };
  // a mouse cannot swipe, so a drag with the mouse turns the page; touch and trackpads scroll natively
  const pdown = (e) => { dragged.current = false; down.current = e.pointerType === 'mouse' && e.button === 0 ? e.clientX : null; };
  const pup = (e) => { if (down.current == null) return; const dx = e.clientX - down.current; down.current = null; if (Math.abs(dx) > 40) { dragged.current = true; to(dx < 0 ? i + 1 : i - 1); } };
  return (<div className="pimgs">
    <div className="pslides" ref={box} onScroll={onScroll} onKeyDown={key} onPointerDown={pdown} onPointerUp={pup} onPointerCancel={() => { down.current = null; }} onClickCapture={(e) => { if (dragged.current) { e.stopPropagation(); e.preventDefault(); dragged.current = false; } }}
      tabIndex={0} role="group" aria-roledescription="carousel" aria-label={`Photo ${i + 1} of ${n}. Use the left and right arrow keys to browse.`}>
      {srcs.map((u, k) => <button key={k} type="button" tabIndex={k === i ? 0 : -1} className="pimg pslide" style={u ? { '--bgimg': `url("${u}")` } : undefined} onClick={() => onOpen(k)} aria-label={`Open photo ${k + 1} of ${n}`}>
        {u ? <FadeImg src={u} alt="" loading={k <= i + 1 ? undefined : 'lazy'} draggable="false" /> : <span className="pslideph" />}</button>)}
    </div>
    {i > 0 && <button type="button" className="pnav l" onClick={() => to(i - 1)} aria-label="Previous photo"><CaretLeft size={20} weight="bold" aria-hidden="true" /></button>}
    {i < n - 1 && <button type="button" className="pnav r" onClick={() => to(i + 1)} aria-label="Next photo"><CaretRight size={20} weight="bold" aria-hidden="true" /></button>}
    <span className="pcount" aria-hidden="true">{i + 1}/{n}</span>
    <div className="pdots">{srcs.map((_, k) => <button type="button" key={k} tabIndex={-1} className={k === i ? 'on' : ''} onClick={() => to(k)} aria-label={`Go to photo ${k + 1}`} aria-current={k === i ? 'true' : undefined}><i /></button>)}</div>
  </div>);
}

export function PostCard({ p, me, img, go, onChange, onDelete, notify, expanded = false }) {
  const [edit, setEdit] = useState(false); const [body, setBody] = useState(p.body); const [title, setTitle] = useState(p.title || '');
  const [open, setOpen] = useState(false); const [zoom, setZoom] = useState(false); const [rep, setRep] = useState(false); const [shr, setShr] = useState(false); const [menu, setMenu] = useState(false); const [zi, setZi] = useState(0); const [pop, setPop] = useState(false); const [full, setFull] = useState(expanded); const moreBtn = useRef(null); const menuBox = useRef(null);
  useEffect(() => {   // the post menu: Esc closes it and hands focus back, arrows move between items, the first item is focused on open
    if (!menu) return undefined; const items = () => [...(menuBox.current?.querySelectorAll('[role="menuitem"]') || [])]; requestAnimationFrame(() => items()[0]?.focus());
    const k = (e) => { if (e.key === 'Escape') { e.preventDefault(); setMenu(false); moreBtn.current?.focus(); } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const l = items(); if (!l.length) return; e.preventDefault(); const at = l.indexOf(document.activeElement); l[(at + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length].focus(); } };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [menu]);
  const extra = p.extra_images || []; const xi = useImages(extra); const own = p.author_id === me.id; const fail = (e) => notify(spamMessage(e) || e.message || 'Something went wrong', 'err');
  const like = async () => { const on = !p.liked; if (on) { setPop(true); setTimeout(() => setPop(false), 600); } onChange({ ...p, liked: on, like_count: p.like_count + (on ? 1 : -1) }); try { await posts.setLike(p.id, on); } catch (e) { onChange(p); fail(e); } };
  const save = async () => { try { const r = await posts.updatePost(p.id, { body, title: p.kind === 'event' ? title : undefined }); onChange({ ...p, body: r.body, title: r.title, edited_at: r.edited_at }); setEdit(false); notify('Post updated'); } catch (e) { fail(e); } };
  const dropImg = async () => { try { await posts.updatePost(p.id, { body: p.body }, { removeImage: true, oldImage: p.image_path, oldExtras: extra }); onChange({ ...p, image_path: null, extra_images: [] }); } catch (e) { fail(e); } };
  const del = async () => { if (!(await ask({ title: 'Delete this post?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return; try { await posts.deletePost(p.id, p.image_path, extra); onDelete(p.id); notify('Post deleted'); } catch (e) { fail(e); } };
  const src = img[p.image_path]; const longText = (p.body || '').length > 360 || (p.body || '').split('\n').length > 7;
  return (<article className={`post${p.author_official ? ' official' : ''}`}>
    <header><button className="who" onClick={() => go('profile', p.author_username)}><Avatar src={img[p.author_avatar_path]} />
      <span><b>{p.author_display_name}{p.author_official && <Verified />}</b><small>@{p.author_username} · <time dateTime={p.created_at} title={fullDate(p.created_at)}>{ago(p.created_at)}</time>{p.edited_at && ' · edited'}</small></span></button>
      {!edit && <div className="pmenuwrap"><button ref={moreBtn} className="ghost pmore" onClick={() => setMenu(!menu)} aria-label="More options" aria-haspopup="menu" aria-expanded={menu}><DotsThree size={24} weight="bold" aria-hidden="true" /></button>
        {menu && <><div className="pmenuback" onClick={() => setMenu(false)} /><div className="pmenu" role="menu" ref={menuBox}>
          {own ? <><button role="menuitem" onClick={() => { setMenu(false); setEdit(true); }}><PencilSimple size={18} weight="bold" aria-hidden="true" />Edit</button>
            <button role="menuitem" className="danger" onClick={() => { setMenu(false); del(); }}><Trash size={18} weight="bold" aria-hidden="true" />Delete</button></>
            : <button role="menuitem" onClick={() => { setMenu(false); setRep(true); }}><Flag size={18} weight="bold" aria-hidden="true" />Report</button>}</div></>}</div>}</header>
    <div className={`pmain${p.image_path && src ? ' has' : ''}`}>
      {p.image_path && !src && <div className="pimg pimgph" aria-hidden="true" />}
      {p.image_path && src && (extra.length ? <PostImages srcs={[src, ...extra.map((x) => xi[x])]} onOpen={(k) => { setZi(k); setZoom(true); }} />
        : <button className="pimg" style={{ '--bgimg': `url("${src}")` }} onClick={() => setZoom(true)} aria-label="Open photo"><FadeImg src={src} alt="" loading="lazy" /></button>)}
      <div className="ptext">
        {p.kind === 'event' && <div className="evmeta"><CalendarBlank size={14} weight="bold" aria-hidden="true" />{new Date(p.event_at).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })}{p.event_place && ` · ${p.event_place}`}</div>}
        {p.place_name && <div className="chipline"><MapPin size={14} weight="bold" aria-hidden="true" />At {p.place_name}</div>}
        {edit ? (<div className="editbox">{p.kind === 'event' && <input value={title} maxLength={100} placeholder="Title" onChange={(e) => setTitle(e.target.value)} />}
          <MentionInput as="textarea" rows="3" maxLength={1000} autoFocus value={body} onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && body.trim()) { e.preventDefault(); save(); } else if (e.key === 'Escape') { e.preventDefault(); setEdit(false); setBody(p.body); setTitle(p.title || ''); } }} />
          <small className="hint">Ctrl + Enter saves, Esc cancels</small>
          <div className="acts"><button className="primary sm" disabled={!body.trim()} onClick={save}>Save</button><button className="ghost sm" onClick={() => { setEdit(false); setBody(p.body); setTitle(p.title || ''); }}>Cancel</button>
            {p.image_path && <button className="ghost sm" onClick={dropImg}>{extra.length ? 'Remove images' : 'Remove image'}</button>}</div></div>)
          : <>{p.title && <h3>{p.title}</h3>}<p className={`pre${longText && !full ? ' clamp' : ''}`}><Rich plain text={p.body} onUser={(u) => go('profile', u)} onTag={(t) => go('tag', t)} /></p>
            {longText && <button type="button" className="pmorebtn" onClick={() => setFull(!full)} aria-expanded={full}>{full ? 'Show less' : 'Show more'}</button>}</>}
      </div>
    </div>
    <footer><button className={`like${p.liked ? ' on' : ''}${pop ? ' pop' : ''}`} onClick={like} aria-pressed={!!p.liked} aria-label={p.liked ? `Unlike (${p.like_count})` : `Like (${p.like_count})`}><Heart size={16} weight={p.liked ? 'fill' : 'bold'} aria-hidden="true" />{p.like_count}</button>
      <button className="ghost sm" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Comments (${p.comment_count})`}><ChatCircle size={16} weight="bold" aria-hidden="true" /><span className="lbl">Comments </span>{p.comment_count}</button>
      {p.visibility !== 'friends' && <button className="ghost sm pshare" onClick={() => setShr(true)} aria-label="Share"><ShareNetwork size={16} weight="bold" aria-hidden="true" /><span className="lbl">Share</span></button>}</footer>
    {open && <Comments postId={p.id} postAuthorId={p.author_id} me={me} go={go} notify={notify} fail={fail} onTag={(t) => go('tag', t)}
      onDelta={(d) => onChange({ ...p, comment_count: Math.max(0, p.comment_count + d) })} />}
    {zoom && <Lightbox items={[{ id: p.id, src, caption: p.body, likes: p.like_count, liked: p.liked }, ...extra.map((x) => ({ id: `${p.id}:${x}`, src: xi[x], caption: p.body, likes: p.like_count, liked: p.liked }))]} index={zi} onClose={() => setZoom(false)} onIndex={setZi} onLike={() => like()} />}
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
  const [drag, setDrag] = useState(false); const [open, setOpen] = useState(false); const [more, setMore] = useState(false); const [restored, setRestored] = useState(false); const [schedVer, setSchedVer] = useState(0);
  const ev = f.kind === 'event'; const set = (k) => (e) => setF({ ...f, [k]: e.target.value }); const expanded = open || f.body || files.length || ev;
  const previews = useMemo(() => files.map((x) => URL.createObjectURL(x)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  useEffect(() => {   // bring back an unfinished draft of this composer
    const d = loadPostDraft(me.id, scope); if (!d) return;
    setF((x) => ({ ...x, ...d, kind: fixedPlace && d.kind === 'event' ? 'status' : d.kind || x.kind, place: fixedPlace || d.place || '' })); setRestored(true); setOpen(true);
  }, [me.id, scope]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => savePostDraft(me.id, scope, f), 400); return () => clearTimeout(t); }, [f, me.id, scope]);
  const take = (list) => {   // from the picker, a drop or a paste
    const all = Array.from(list || []); const add = all.filter((x) => x.type.startsWith('image/'));
    if (!add.length) { if (all.length) notify('Only photos can be attached.', 'err'); return; }
    if (files.length + add.length > posts.MAX_IMAGES) notify(`Up to ${posts.MAX_IMAGES} photos per post.`, 'err');
    setFiles((cur) => [...cur, ...add].slice(0, posts.MAX_IMAGES)); setOpen(true);
  };
  const addFiles = (e) => { const l = Array.from(e.target.files || []); e.target.value = ''; take(l); };
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
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
    <form className={`composer panel${expanded ? ' open' : ''}${drag ? ' drag' : ''}`} onSubmit={submit}
      onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); setDrag(true); } }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false); }}
      onDrop={(e) => { if (hasFiles(e)) { e.preventDefault(); setDrag(false); take(e.dataTransfer.files); } }}
      onPaste={(e) => { const fl = Array.from(e.clipboardData?.files || []); if (fl.length) { e.preventDefault(); take(fl); } }}>
      {drag && <div className="dropnote" aria-hidden="true"><ImageSquare size={28} weight="bold" />Drop photos to attach</div>}
      {ev && <input placeholder="Event title" maxLength={100} required value={f.title} onChange={set('title')} />}
      <MentionInput as="textarea" rows={expanded ? 3 : 1} maxLength={1000} required placeholder={ev ? 'Details' : f.kind === 'ask' ? 'Ask your neighbours…' : "What's happening?"} value={f.body} onFocus={() => setOpen(true)} onChange={set('body')}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (f.body.trim() && !busy) e.currentTarget.form?.requestSubmit(); } }} />
      {f.body.length > 800 && <small className={`ccount${f.body.length >= 980 ? ' hot' : ''}`} aria-live="polite">{f.body.length}/1000</small>}
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
          <button className="primary" title="Ctrl + Enter" disabled={busy || !f.body.trim()}>{busy ? (later ? 'Scheduling…' : 'Posting…') : later ? 'Schedule' : ev ? 'Publish' : 'Post'}</button></div></>}
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
  return <Icon className={`navic navic-${name}`} size="1.4em" weight={active ? 'fill' : 'regular'} aria-hidden="true" />;
}
