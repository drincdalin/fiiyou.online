import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarBlank, ChatCircle, ChatText, Clock, Globe, Heart, ListChecks, MagnifyingGlass, NotePencil, Question, Trash, Users, X } from '@phosphor-icons/react';
import { posts } from '../index.js';
import { ago, fullDate, useImages } from './shared.jsx';
import { ask } from './dialog.jsx';
import { ErrorState, friendlyError } from './errors.jsx';
import { EmptyState, RowsSkeleton } from './states.jsx';
import { KIND_LABEL, allIds, countLabel, excerpt, filterParams } from '../lib/myPosts.js';
import './content.css';

/* "Your posts": everything you have posted, in one place. Find a post, open it, delete one or many, and see or cancel what is scheduled.
   Reached from Settings and from your own profile (/settings/content). The list comes from the my_posts function (0041_my_posts.sql). */

const PAGE = 30;
const KIND_ICON = { status: ChatText, ask: Question, event: CalendarBlank };
const KINDS = [[null, 'All'], ['status', 'Posts'], ['ask', 'Questions'], ['event', 'Events']];

function Thumb({ row, src }) {
  const Icon = KIND_ICON[row.kind] || ChatText;
  if (row.image_path && typeof src === 'string') return <span className="cp-thumb"><img src={src} alt="" loading="lazy" />{(row.extra_images || []).length > 0 && <i className="cp-more">+{row.extra_images.length}</i>}</span>;
  if (row.image_path && src === undefined) return <span className="cp-thumb cp-wait" aria-hidden="true" />;
  return <span className="cp-thumb cp-icon" aria-hidden="true"><Icon size={22} weight="regular" /></span>;
}

function Meta({ row }) {
  const friends = row.visibility === 'friends';
  return (
    <span className="cp-meta">
      <span>{KIND_LABEL[row.kind] || 'Post'}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={row.created_at} title={fullDate(row.created_at)}>{ago(row.created_at)}</time>
      {row.edited_at && <><span aria-hidden="true">·</span><span>edited</span></>}
      <span aria-hidden="true">·</span>
      <span className="cp-vis">{friends ? <Users size={13} weight="bold" aria-hidden="true" /> : <Globe size={13} weight="bold" aria-hidden="true" />}{friends ? 'Friends only' : 'Everyone'}</span>
      {row.place_name && <><span aria-hidden="true">·</span><span className="cp-place">{row.place_name}</span></>}
    </span>
  );
}

export default function ContentView({ go, notify }) {
  const [tab, setTab] = useState('posts');   // posts | scheduled
  const [kind, setKind] = useState(null); const [friendsOnly, setFriendsOnly] = useState(false);
  const [text, setText] = useState(''); const [q, setQ] = useState('');
  const [rows, setRows] = useState(null); const [more, setMore] = useState(false); const [busyMore, setBusyMore] = useState(false); const [err, setErr] = useState(null);
  const [stats, setStats] = useState(null);
  const [selecting, setSelecting] = useState(false); const [sel, setSel] = useState(() => new Set()); const [deleting, setDeleting] = useState(false);
  const [sched, setSched] = useState(null);
  const run = useRef(0);
  const img = useImages(rows ? rows.map((r) => r.image_path) : []);
  const filtered = kind !== null || friendsOnly || q !== '';

  useEffect(() => { document.title = 'Your posts · fiiyou'; }, []);
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 300); return () => clearTimeout(t); }, [text]);

  const loadStats = useCallback(() => posts.myPostStats().then(setStats).catch(() => {}), []);
  const loadSched = useCallback(() => posts.listScheduled().then(setSched).catch(() => setSched([])), []);
  useEffect(() => { loadStats(); loadSched(); }, [loadStats, loadSched]);

  const load = useCallback(async () => {
    const id = ++run.current; setRows(null); setErr(null); setSel(new Set());
    try { const r = await posts.myPosts({ limit: PAGE, ...filterParams({ kind, friendsOnly, q }) }); if (id !== run.current) return; setRows(r); setMore(r.length === PAGE); }
    catch (e) { if (id === run.current) setErr(e); }
  }, [kind, friendsOnly, q]);
  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (busyMore || !rows?.length) return; setBusyMore(true);
    try { const r = await posts.myPosts({ limit: PAGE, before: rows[rows.length - 1].created_at, ...filterParams({ kind, friendsOnly, q }) }); setRows((cur) => [...cur, ...r]); setMore(r.length === PAGE); }
    catch (e) { notify(friendlyError(e, 'Could not load more.'), 'err'); }
    setBusyMore(false);
  };

  const toggle = (id) => setSel((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const stopSelecting = () => { setSelecting(false); setSel(new Set()); };
  const gone = (r) => { window.dispatchEvent(new CustomEvent('fiiyou:postgone', { detail: r.id })); };

  const removeOne = async (r) => {
    if (!(await ask({ title: 'Delete this post?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    try { await posts.deletePost(r.id, r.image_path, r.extra_images || []); gone(r); setRows((cur) => cur.filter((x) => x.id !== r.id)); setSel((cur) => { const n = new Set(cur); n.delete(r.id); return n; }); loadStats(); notify('Post deleted'); }
    catch (e) { notify(friendlyError(e, 'Could not delete the post.'), 'err'); }
  };
  const removeSelected = async () => {
    const list = rows.filter((r) => sel.has(r.id)); if (!list.length || deleting) return;
    const n = list.length;
    if (!(await ask({ title: `Delete ${countLabel(n)}?`, message: 'They will be gone for good, with their photos, likes and comments.', confirmLabel: `Delete ${n}`, danger: true }))) return;
    setDeleting(true); let failed = 0;
    for (const r of list) { try { await posts.deletePost(r.id, r.image_path, r.extra_images || []); gone(r); } catch { failed += 1; } }
    setDeleting(false); stopSelecting(); loadStats(); await load();
    notify(failed ? `Deleted ${n - failed}, ${failed} could not be deleted.` : `Deleted ${countLabel(n)}`, failed ? 'err' : undefined);
  };
  const cancelScheduled = async (r) => {
    if (!(await ask({ title: 'Cancel this scheduled post?', message: 'It will not be published and is deleted.', confirmLabel: 'Cancel post', danger: true }))) return;
    try { await posts.cancelScheduled(r); loadSched(); notify('Scheduled post cancelled'); } catch (e) { notify(friendlyError(e, 'Could not cancel it.'), 'err'); }
  };
  const clearFilters = () => { setKind(null); setFriendsOnly(false); setText(''); setQ(''); };

  const nSel = sel.size; const allOn = rows?.length > 0 && nSel === rows.length;
  const nSched = sched?.length || 0;

  return (
    <div className="plain view content">
      <header className="chead">
        <button type="button" className="ghost sm cback" onClick={() => go('settings')}><ArrowLeft size={16} weight="bold" aria-hidden="true" />Settings</button>
        <h2>Your posts</h2>
        <p className="chint">Everything you have posted, in one place. Open a post to edit it.</p>
      </header>

      <dl className="cstats" aria-label="Totals">
        {[['Posts', stats?.posts], ['Likes', stats?.likes], ['Comments', stats?.comments]].map(([l, v]) => (
          <div key={l} className="cstat"><dt>{l}</dt><dd>{v == null ? <i className="skln w30" aria-hidden="true" /> : Number(v).toLocaleString('en-GB')}</dd></div>
        ))}
      </dl>

      <div className="tabs" role="tablist" aria-label="Your posts">
        <button type="button" role="tab" aria-selected={tab === 'posts'} className={tab === 'posts' ? 'on' : ''} onClick={() => setTab('posts')}>Published</button>
        <button type="button" role="tab" aria-selected={tab === 'scheduled'} className={tab === 'scheduled' ? 'on' : ''} onClick={() => setTab('scheduled')}>Scheduled{nSched > 0 && <span className="count">{nSched}</span>}</button>
      </div>

      {tab === 'posts' && <>
        <div className="ctools">
          <label className="csearch"><MagnifyingGlass size={18} weight="bold" aria-hidden="true" />
            <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search your posts" aria-label="Search your posts" maxLength={80} />
            {text && <button type="button" className="cclear" aria-label="Clear search" onClick={() => { setText(''); setQ(''); }}><X size={14} weight="bold" aria-hidden="true" /></button>}</label>
          <div className="cchips" role="group" aria-label="Filter">
            {KINDS.map(([k, l]) => <button key={l} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
            <button type="button" className="chip" aria-pressed={friendsOnly} onClick={() => setFriendsOnly(!friendsOnly)}><Users size={14} weight="bold" aria-hidden="true" />Friends only</button>
          </div>
        </div>

        <div className="cbar" role={selecting ? 'toolbar' : undefined} aria-label={selecting ? 'Selected posts' : undefined}>
          {selecting ? <>
            <label className="cselall"><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(allIds(rows)))} />{nSel ? `${nSel} selected` : 'Select all'}</label>
            <span className="cbar-end">
              <button type="button" className="ghost sm" onClick={stopSelecting}>Cancel</button>
              <button type="button" className="primary sm danger" disabled={!nSel} aria-busy={deleting || undefined} onClick={removeSelected}><Trash size={16} weight="bold" aria-hidden="true" />Delete{nSel ? ` ${nSel}` : ''}</button>
            </span></>
            : <>
              <span className="ctotal" role="status" aria-live="polite">{rows ? `${countLabel(rows.length)}${more ? '+' : ''}${filtered ? ' found' : ''}` : 'Loading'}</span>
              <button type="button" className="ghost sm" disabled={!rows?.length} onClick={() => setSelecting(true)}><ListChecks size={16} weight="bold" aria-hidden="true" />Select</button></>}
        </div>

        {err ? <ErrorState error={err} onRetry={load} title="Could not load your posts" />
          : rows === null ? <RowsSkeleton n={5} label="Loading your posts" />
          : rows.length === 0 ? (filtered
            ? <EmptyState icon={MagnifyingGlass} title="Nothing matches" action={<button type="button" className="ghost" onClick={clearFilters}>Clear filters</button>}>Try another word, or look at all your posts.</EmptyState>
            : <EmptyState icon={NotePencil} title="You have not posted yet" action={<button type="button" className="primary" onClick={() => go('home')}>Write a post</button>}>When you do, it shows up here so you can find it, open it or delete it.</EmptyState>)
          : <>
            <ul className="clist">
              {rows.map((r) => {
                const on = sel.has(r.id); const label = r.title || excerpt(r.body, 60) || 'Post';
                return (
                  <li key={r.id} className={`cp${on ? ' on' : ''}`}>
                    {selecting && <input type="checkbox" className="cp-check" checked={on} onChange={() => toggle(r.id)} aria-label={`Select: ${label}`} />}
                    <button type="button" className="cp-main" onClick={() => (selecting ? toggle(r.id) : go('post', r.id))} aria-label={selecting ? undefined : `Open post: ${label}`}>
                      <Thumb row={r} src={img[r.image_path]} />
                      <span className="cp-body">
                        {r.title && <b className="cp-title">{r.title}</b>}
                        <span className="cp-text">{excerpt(r.body, 200)}</span>
                        <Meta row={r} />
                      </span>
                    </button>
                    <span className="cp-side">
                      <span className="cp-counts"><span title="Likes"><Heart size={14} weight="bold" aria-hidden="true" /><span className="sronly">Likes: </span>{Number(r.like_count)}</span>
                        <span title="Comments"><ChatCircle size={14} weight="bold" aria-hidden="true" /><span className="sronly">Comments: </span>{Number(r.comment_count)}</span></span>
                      {!selecting && <button type="button" className="ghost sm cp-del" onClick={() => removeOne(r)} aria-label={`Delete: ${label}`}><Trash size={16} weight="bold" aria-hidden="true" /></button>}
                    </span>
                  </li>);
              })}
            </ul>
            {more && <button type="button" className="ghost wide cmore" aria-busy={busyMore || undefined} onClick={loadMore}>Load more</button>}
          </>}
      </>}

      {tab === 'scheduled' && (sched === null ? <RowsSkeleton n={2} label="Loading scheduled posts" />
        : sched.length === 0 ? <EmptyState icon={Clock} title="Nothing scheduled">Pick a time under More options when you write a post, and it goes out by itself.</EmptyState>
        : <ul className="clist">
          {sched.map((r) => (
            <li key={r.id} className="cp">
              <span className="cp-main cp-static">
                <span className="cp-thumb cp-icon" aria-hidden="true"><Clock size={22} weight="regular" /></span>
                <span className="cp-body">
                  {r.title && <b className="cp-title">{r.title}</b>}
                  <span className="cp-text">{excerpt(r.body, 200)}</span>
                  <span className="cp-meta"><span>Goes out {fullDate(r.publish_at)}</span><span aria-hidden="true">·</span><span className="cp-vis">{r.visibility === 'friends' ? <Users size={13} weight="bold" aria-hidden="true" /> : <Globe size={13} weight="bold" aria-hidden="true" />}{r.visibility === 'friends' ? 'Friends only' : 'Everyone'}</span></span>
                </span>
              </span>
              <span className="cp-side"><button type="button" className="ghost sm cp-del" onClick={() => cancelScheduled(r)} aria-label="Cancel this scheduled post"><Trash size={16} weight="bold" aria-hidden="true" /></button></span>
            </li>))}
        </ul>)}
    </div>
  );
}
