import { useCallback, useEffect, useRef, useState } from 'react';
import { posts, discover, friends } from '../index.js';
import { useImages, Avatar } from './shared.jsx';
import { PostCard } from './parts.jsx';
import { ErrorState, friendlyError } from './errors.jsx';

/** Search (/search?q=…) and the hashtag page (/tag/<tag>). One place for finding things:
 *  - nothing typed: trending hashtags + people to discover (random or newest, any locality)
 *  - something typed: people, posts and hashtags (people can be narrowed to a locality)
 *  Posts are the PUBLIC ones whose text contains the words; friends-only posts are never searched (see 0029_search_schedule_pins_images.sql). */
export default function SearchView({ me, go, notify, onInvite, initialQuery = '', initialTag = '', embedded = false }) {
  const [q, setQ] = useState(initialQuery); const [tag, setTag] = useState(initialTag);   // tag = a hashtag page; q = a text search
  const [tab, setTab] = useState('all'); const [loc, setLoc] = useState(''); const [locs, setLocs] = useState([]); const [mode, setMode] = useState('random');
  const [people, setPeople] = useState(null); const [tags, setTags] = useState(null); const [rows, setRows] = useState(null); const [cursor, setCursor] = useState(null); const [more, setMore] = useState(false);
  const [err, setErr] = useState(null); const [trending, setTrending] = useState([]); const [busyMore, setBusyMore] = useState(false);
  const [disc, setDisc] = useState(null); const [derr, setDerr] = useState(null);   // people to discover (nothing typed)
  const [fl, setFl] = useState([]); const [inc, setInc] = useState([]); const [out, setOut] = useState([]);   // where you stand with each person
  const seq = useRef(0); const dseq = useRef(0); const term = q.trim(); const searching = !tag && term.length >= 2; const browsing = !tag && !searching;

  const loadF = useCallback(() => Promise.all([friends.listFriends().then(setFl), friends.incomingRequests().then(setInc), friends.outgoingRequests().then(setOut)]).catch(() => {}), []);
  useEffect(() => { posts.trendingTags(7, 8).then(setTrending).catch(() => {}); discover.listLocalities().then(setLocs).catch(() => {}); loadF(); }, [loadF]);
  // keep the address bar in step with what is shown (replace, so Back does not step through every keystroke)
  useEffect(() => { if (embedded) return; try { const base = import.meta.env.BASE_URL.replace(/\/$/, ''); history.replaceState(null, '', tag ? `${base}/tag/${encodeURIComponent(tag)}` : term ? `${base}/search?q=${encodeURIComponent(term)}` : `${base}/search`); } catch { /* ignore */ } }, [tag, term, embedded]);

  const loadDisc = useCallback(() => {
    const my = ++dseq.current; setDerr(null); setDisc(null);
    return discover.discover({ localityId: loc ? +loc : null, mode })
      .then((r) => { if (my === dseq.current) setDisc(r.filter((p) => p.id !== me.id)); })
      .catch((e) => { if (my === dseq.current) { setDerr(e); setDisc([]); } });
  }, [loc, mode, me.id]);
  useEffect(() => { if (browsing) loadDisc(); }, [browsing, loadDisc]);

  const run = useCallback(async () => {
    const my = ++seq.current; setErr(null);
    if (!tag && term.length < 2) { setPeople(null); setTags(null); setRows(null); setMore(false); return; }
    setPeople(null); setTags(null); setRows(null);
    try {
      if (tag) { const r = await posts.tagFeed({ tag, limit: 20 }); if (my !== seq.current) return; setRows(r.rows); setCursor(r.cursor); setMore(r.more); return; }
      const [pe, ta, po] = await Promise.all([
        discover.searchProfiles(term, 12, loc ? +loc : null).catch(() => []), posts.searchTags(term, 8).catch(() => []), posts.searchPosts({ query: term, limit: 20 })]);
      if (my !== seq.current) return;
      setPeople(pe.filter((p) => p.id !== me.id)); setTags(ta); setRows(po.rows); setCursor(po.cursor); setMore(po.more);
    } catch (e) { if (my === seq.current) { setErr(e); setRows([]); } }
  }, [term, tag, loc, me.id]);
  useEffect(() => { const t = setTimeout(run, tag ? 0 : 350); return () => clearTimeout(t); }, [run, tag]);

  const loadMore = async () => {
    setBusyMore(true);
    try { const r = tag ? await posts.tagFeed({ tag, before: cursor, limit: 20 }) : await posts.searchPosts({ query: term, before: cursor, limit: 20 });
      setRows((x) => [...(x || []), ...r.rows]); setCursor(r.cursor); setMore(r.more); } catch (e) { notify(friendlyError(e), 'err'); }
    setBusyMore(false);
  };
  const img = useImages([...(people || []), ...(disc || [])].map((p) => p.avatar_path).concat((rows || []).flatMap((p) => [p.image_path, ...(p.extra_images || []), p.author_avatar_path])));
  const change = (np) => setRows((r) => r.map((x) => (x.id === np.id ? np : x))); const drop = (id) => setRows((r) => r.filter((x) => x.id !== id));
  const openTag = (t) => { setTag(t); setQ(''); setTab('all'); window.scrollTo(0, 0); };

  const lname = (id) => locs.find((l) => l.id === id)?.name;
  const isFriend = (id) => fl.some((f) => f.id === id); const sentTo = (id) => out.some((r) => r.to?.id === id); const incFrom = (id) => inc.find((r) => r.from?.id === id);
  const act = (fn, msg) => fn().then(() => { notify(msg); loadF(); }).catch((e) => notify(friendlyError(e), 'err'));
  const status = (p) => {
    if (isFriend(p.id)) return <span className="acts"><small>Friends</small><button className="ghost sm" onClick={() => go('messages', null, p.id)}>Message</button></span>;
    const r = incFrom(p.id); if (r) return <button className="primary sm" onClick={() => act(() => friends.acceptRequest(r.id), 'Friend added')}>Accept</button>;
    if (sentTo(p.id)) return <small>Request sent</small>;
    return <button className="primary sm" onClick={() => act(() => friends.sendRequest(p.id), 'Request sent')}>Add</button>;
  };
  const person = (p) => (<div className="row" key={p.id}><Avatar src={img[p.avatar_path]} size={44} />
    <button className="link" onClick={() => go('profile', p.username)}>{p.display_name}<small>{[p.headline, lname(p.locality_id)].filter(Boolean).join(' · ') || `@${p.username}`}</small></button>{status(p)}</div>);

  const postList = (list) => list.map((p) => <PostCard key={p.id} p={p} me={me} img={img} go={go} onChange={change} onDelete={drop} notify={notify} />);
  const loading = (searching || tag) && rows === null && !err;
  const none = !loading && !err && (searching || tag) && !(people?.length || tags?.length || rows?.length);

  const chip = (t) => <button key={t.tag} type="button" onClick={() => openTag(t.tag)}>#{t.tag} <span className="count">{Number(t.uses)}</span></button>;
  return (<div className={embedded ? 'sview' : 'plain view'}>
    <div className="inline" role="search">
      <input autoFocus={!embedded && !initialQuery && !initialTag} type="search" inputMode="search" enterKeyHint="search" value={tag ? `#${tag}` : q} maxLength={80} placeholder="Search people, posts and #hashtags"
        aria-label="Search" onChange={(e) => { if (tag) setTag(''); setQ(e.target.value); setTab('all'); }} />
      {!tag && <select value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Show people from"><option value="">People: anywhere</option>{locs.map((l) => <option key={l.id} value={l.id}>People: {l.name}</option>)}</select>}
      {(q || tag) && <button type="button" className="ghost sm" onClick={() => { setQ(''); setTag(''); }}>Clear</button>}
    </div>

    {browsing && <>
      {trending.length > 0 && <><p className="muted">Trending this week</p><div className="tabs">{trending.map(chip)}</div></>}
      <div className="tabs"><p className="muted" style={{ margin: 0, marginRight: 'auto' }}>Discover people</p>
        {[['random', 'Random'], ['new', 'Newest']].map(([k, l]) => <button key={k} type="button" className={mode === k ? 'on' : ''} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}</div>
      {derr ? <ErrorState error={derr} onRetry={loadDisc} title="Could not load people" />
        : disc === null ? <p className="empty" role="status">Loading…</p>
        : !disc.length ? <div className="empty"><p>{loc ? `No one new in ${lname(+loc) || 'this locality'} yet.` : 'No one to show yet.'}</p>{onInvite && <button className="primary" onClick={onInvite}>Invite someone</button>}</div>
        : disc.map(person)}
      {q.trim().length === 1 && <p className="muted" role="status">Type at least 2 letters to search.</p>}
    </>}

    {tag && <p className="muted">Public posts with #{tag}</p>}

    {searching && <div className="tabs" role="tablist" aria-label="Search results">
      {[['all', 'All'], ['people', 'People'], ['posts', 'Posts'], ['tags', 'Hashtags']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>}

    {err && <ErrorState error={err} onRetry={run} title="Search failed" />}
    {loading && <p className="empty" role="status">Searching…</p>}
    {none && <p className="empty">{tag ? 'No public posts with this hashtag yet.' : `Nothing found for “${term}”.`}</p>}

    {searching && !loading && !err && (tab === 'all' || tab === 'people') && !!people?.length && (<>
      {tab === 'all' && <p className="muted">People</p>}
      {(tab === 'all' ? people.slice(0, 3) : people).map(person)}
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
