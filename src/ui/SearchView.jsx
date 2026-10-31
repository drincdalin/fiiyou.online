import { useCallback, useEffect, useRef, useState } from 'react';
import { posts, discover } from '../index.js';
import { useImages, Avatar } from './shared.jsx';
import { PostCard } from './parts.jsx';
import { ErrorState, friendlyError } from './errors.jsx';

/** Global search (/search?q=…) and the hashtag page (/tag/<tag>). People, posts and hashtags in one place.
 *  Posts are the PUBLIC ones whose text contains the words; friends-only posts are never searched (see 0029_search_schedule_pins_images.sql). */
export default function SearchView({ me, go, notify, initialQuery = '', initialTag = '' }) {
  const [q, setQ] = useState(initialQuery); const [tag, setTag] = useState(initialTag);   // tag = a hashtag page; q = a text search
  const [tab, setTab] = useState('all');
  const [people, setPeople] = useState(null); const [tags, setTags] = useState(null); const [rows, setRows] = useState(null); const [cursor, setCursor] = useState(null); const [more, setMore] = useState(false);
  const [err, setErr] = useState(null); const [trending, setTrending] = useState([]); const [busyMore, setBusyMore] = useState(false);
  const seq = useRef(0); const term = q.trim(); const searching = !tag && term.length >= 2;

  useEffect(() => { posts.trendingTags(7, 8).then(setTrending).catch(() => {}); }, []);
  // keep the address bar in step with what is shown (replace, so Back does not step through every keystroke)
  useEffect(() => { try { const base = import.meta.env.BASE_URL.replace(/\/$/, ''); history.replaceState(null, '', tag ? `${base}/tag/${encodeURIComponent(tag)}` : term ? `${base}/search?q=${encodeURIComponent(term)}` : `${base}/search`); } catch { /* ignore */ } }, [tag, term]);

  const run = useCallback(async () => {
    const my = ++seq.current; setErr(null);
    if (!tag && term.length < 2) { setPeople(null); setTags(null); setRows(null); setMore(false); return; }
    setPeople(null); setTags(null); setRows(null);
    try {
      if (tag) { const r = await posts.tagFeed({ tag, limit: 20 }); if (my !== seq.current) return; setRows(r.rows); setCursor(r.cursor); setMore(r.more); return; }
      const [pe, ta, po] = await Promise.all([
        discover.searchProfiles(term, 12).catch(() => []), posts.searchTags(term, 8).catch(() => []), posts.searchPosts({ query: term, limit: 20 })]);
      if (my !== seq.current) return;
      setPeople(pe); setTags(ta); setRows(po.rows); setCursor(po.cursor); setMore(po.more);
    } catch (e) { if (my === seq.current) { setErr(e); setRows([]); } }
  }, [term, tag]);
  useEffect(() => { const t = setTimeout(run, tag ? 0 : 350); return () => clearTimeout(t); }, [run, tag]);

  const loadMore = async () => {
    setBusyMore(true);
    try { const r = tag ? await posts.tagFeed({ tag, before: cursor, limit: 20 }) : await posts.searchPosts({ query: term, before: cursor, limit: 20 });
      setRows((x) => [...(x || []), ...r.rows]); setCursor(r.cursor); setMore(r.more); } catch (e) { notify(friendlyError(e), 'err'); }
    setBusyMore(false);
  };
  const img = useImages([...(people || []).map((p) => p.avatar_path), ...(rows || []).flatMap((p) => [p.image_path, ...(p.extra_images || []), p.author_avatar_path])]);
  const change = (np) => setRows((r) => r.map((x) => (x.id === np.id ? np : x))); const drop = (id) => setRows((r) => r.filter((x) => x.id !== id));
  const openTag = (t) => { setTag(t); setQ(''); setTab('all'); window.scrollTo(0, 0); };

  const postList = (list) => list.map((p) => <PostCard key={p.id} p={p} me={me} img={img} go={go} onChange={change} onDelete={drop} notify={notify} />);
  const loading = (searching || tag) && rows === null && !err;
  const none = !loading && !err && (searching || tag) && !(people?.length || tags?.length || rows?.length);

  const chip = (t) => <button key={t.tag} type="button" onClick={() => openTag(t.tag)}>#{t.tag} <span className="count">{Number(t.uses)}</span></button>;
  return (<div className="plain view">
    <div className="inline" role="search">
      <input autoFocus={!initialQuery && !initialTag} type="search" inputMode="search" enterKeyHint="search" value={tag ? `#${tag}` : q} maxLength={80} placeholder="Search people, posts and #hashtags"
        aria-label="Search" onChange={(e) => { if (tag) setTag(''); setQ(e.target.value); setTab('all'); }} />
      {(q || tag) && <button type="button" className="ghost sm" onClick={() => { setQ(''); setTag(''); }}>Clear</button>}
    </div>

    {!searching && !tag && (trending.length > 0
      ? <><p className="muted">Trending this week</p><div className="tabs">{trending.map(chip)}</div></>
      : <p className="muted">Type at least 2 letters to search. Start with # to find a hashtag.</p>)}

    {tag && <p className="muted">Public posts with #{tag}</p>}

    {searching && <div className="tabs" role="tablist" aria-label="Search results">
      {[['all', 'All'], ['people', 'People'], ['posts', 'Posts'], ['tags', 'Hashtags']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>}

    {err && <ErrorState error={err} onRetry={run} title="Search failed" />}
    {loading && <p className="empty" role="status">Searching…</p>}
    {none && <p className="empty">{tag ? 'No public posts with this hashtag yet.' : `Nothing found for “${term}”.`}</p>}

    {searching && !loading && !err && (tab === 'all' || tab === 'people') && !!people?.length && (<>
      {tab === 'all' && <p className="muted">People</p>}
      {(tab === 'all' ? people.slice(0, 3) : people).map((p) => (<div className="row" key={p.id}><Avatar src={img[p.avatar_path]} size={44} />
        <button className="link" onClick={() => go('profile', p.username)}>{p.display_name}<small>{p.headline || `@${p.username}`}</small></button></div>))}
      {tab === 'all' && people.length > 3 && <button className="ghost sm" onClick={() => setTab('people')}>All {people.length} people</button>}</>)}

    {searching && !loading && !err && (tab === 'all' || tab === 'tags') && !!tags?.length && (<>
      {tab === 'all' && <p className="muted">Hashtags</p>}
      <div className="tabs">{tags.map(chip)}</div></>)}

    {(tag || (searching && (tab === 'all' || tab === 'posts'))) && !loading && !err && !!rows?.length && (<>
      {!tag && tab === 'all' && <p className="muted">Posts</p>}
      {postList(tag || tab === 'posts' ? rows : rows.slice(0, 4))}
      {!tag && tab === 'all' && rows.length > 4 && <button className="ghost sm" onClick={() => setTab('posts')}>More posts</button>}
      {(tag || tab === 'posts') && more && <button className="ghost wide" disabled={busyMore} onClick={loadMore}>{busyMore ? 'Loading…' : 'Load more'}</button>}</>)}
  </div>);
}
