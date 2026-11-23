import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { visiblePoll, debounce } from '../lib/poll.js';
import { posts, social, friends, discover, profiles } from '../index.js';
import { useImages, Avatar, ago, reducedMotion, useTouchScreen } from './shared.jsx';
import { PostCard, Composer, Lightbox, ReportModal } from './parts.jsx';
import { SharedPostCard, decodeSharedPost, previewText } from './PostShare.jsx';
import { decodeGif, encodeGif } from '../lib/gifs.js';
import GifPicker from './GifPicker.jsx';
import { MessageMenu, MessageEditor, MessageSheet } from './MessageMenu.jsx';
import { ask } from './dialog.jsx';
import { ErrorState, friendlyError } from './errors.jsx';
import { ArrowBendUpLeft, ArrowDown, CalendarBlank, ChatsCircle, Crosshair, Gif, Heart, MagnifyingGlass, MapPin, PaperPlaneRight, Plus, PushPin, UsersThree, X } from '@phosphor-icons/react';
import './more.css';
import LocalityPicker from './LocalityPicker.jsx';

/* The feeds you already opened stay in memory while the app is open: Back from a profile or a post shows the feed (and your place in it)
   at once and refreshes it quietly, instead of an empty screen and a reload. Keyed by person + filter, so nobody sees someone else's feed. */
const feedCache = new Map();   // key -> { rows, more }
addEventListener('fiiyou:postgone', (e) => { for (const v of feedCache.values()) v.rows = v.rows.filter((x) => x.id !== e.detail); });

const useFeed = (args, notify, scope = '') => {
  const key = `${scope}|${JSON.stringify(args)}`; const hit = feedCache.get(key);
  const [rows, setRows] = useState(hit ? hit.rows : null); const [more, setMore] = useState(hit ? hit.more : false); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const cache = useRef([]); const loading = useRef(false);
  const load = useCallback(async (append = false, cur = [], reset = false) => {
    if (!append) setErr(null); else { if (loading.current) return; loading.current = true; setBusy(true); }
    try {
      const before = append && cur.length ? cur[cur.length - 1].created_at : null; const r = await posts.feed({ ...args, before, limit: 20 });
      let next = append ? [...cur, ...r] : r; let mre = r.length === 20 && !args.upcoming;
      if (!append && !reset) {   // a quiet refresh keeps the older pages you already scrolled through, so the page does not shrink under you
        const prev = feedCache.get(key)?.rows || []; const last = r[r.length - 1];
        if (last && r.length === 20 && prev.length > r.length) { next = [...r, ...prev.filter((x) => x.created_at < last.created_at)]; mre = feedCache.get(key)?.more ?? mre; }
      }
      feedCache.set(key, { rows: next, more: mre, at: Date.now() }); setRows(next); setMore(mre);
    } catch (e) { if (append) notify(friendlyError(e), 'err'); else if (!feedCache.get(key)) { setErr(e); setRows([]); } /* a failed quiet refresh keeps showing what is there */ }
    finally { if (append) { loading.current = false; setBusy(false); } }
  }, [key]);
  // coming back to a feed you opened less than 30 s ago shows it as it is, with no request at all; older ones refresh quietly in the background
  useEffect(() => { const c = feedCache.get(key); setRows(c ? c.rows : null); setMore(c ? c.more : false); if (c && Date.now() - c.at < 30000) return; load(false); }, [load]);
  useEffect(() => { const h = () => load(false); addEventListener('fiiyou:published', h); return () => removeEventListener('fiiyou:published', h); }, [load]);   // a scheduled post just went out
  cache.current = rows || [];
  const next = useCallback(() => { if (cache.current.length) load(true, cache.current); }, [load]);
  useEffect(() => {   // Home tab pressed again = refresh from the top; coming back to the tab after a while = quiet refresh
    const h = () => load(false, [], true); let hid = 0;
    const vis = () => { if (document.hidden) hid = Date.now(); else if (hid && Date.now() - hid > 180000) { hid = 0; load(false); } };
    addEventListener('fiiyou:refresh', h); document.addEventListener('visibilitychange', vis);
    return () => { removeEventListener('fiiyou:refresh', h); document.removeEventListener('visibilitychange', vis); };
  }, [load]);
  const img = useImages((rows || []).flatMap((p) => [p.image_path, ...(p.extra_images || []), p.author_avatar_path]));
  const put = (fn) => setRows((r) => { const n = fn(r || []); feedCache.set(key, { rows: n, more: feedCache.get(key)?.more ?? false, at: feedCache.get(key)?.at ?? Date.now() }); return n; });
  const change = (np) => put((r) => r.map((x) => (x.id === np.id ? np : x))); const drop = (id) => put((r) => r.filter((x) => x.id !== id));
  return { rows, more, load, next, busy, img, change, drop, err };
};
const Skeleton = ({ n = 3 }) => (<div className="skels" aria-busy="true" aria-label="Loading posts">{Array.from({ length: n }, (_, k) => (<div className="post skel" key={k} aria-hidden="true"><div className="skrow"><i className="skav" /><span><i className="skln w40" /><i className="skln w25" /></span></div>
  <i className="skln w90" /><i className="skln w70" />{k % 2 === 0 && <i className="skimg" />}</div>))}</div>);

/** Loads the next page when it scrolls near the screen; the button stays as a fallback. */
function Sentinel({ onHit, busy }) {
  const el = useRef(null); const hit = useRef(onHit); hit.current = onHit;
  useEffect(() => { const n = el.current; if (!n || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) hit.current(); }, { rootMargin: '700px 0px' }); io.observe(n); return () => io.disconnect(); }, [busy]);
  return <button ref={el} type="button" className="ghost wide moreposts" aria-busy={busy || undefined} onClick={() => !busy && onHit()}>Load more</button>;
}

const List = ({ f, me, go, notify, empty, Icon = ChatsCircle }) => !f.rows ? <Skeleton /> : f.err && !f.rows.length ? <ErrorState error={f.err} onRetry={() => f.load(false)} title="Could not load posts" /> : (<>
  {!f.rows.length && <div className="empty emptyx"><Icon size={40} weight="duotone" aria-hidden="true" /><p>{empty}</p></div>}
  {f.rows.map((p) => <PostCard key={p.id} p={p} me={me} img={f.img} go={go} onChange={f.change} onDelete={f.drop} notify={notify} />)}
  {f.more && <Sentinel onHit={f.next} busy={f.busy} />}</>);

/* ---------------- Single post (opened from a shared-post card in chat: #/post/<id>) ---------------- */
export function PostView({ id, me, go, notify }) {
  const [p, setP] = useState(undefined);   // undefined = loading, null = missing or not visible to this person
  const [err, setErr] = useState(null);   // a real failure (network...) is not the same as "this post is not available"
  const fetchPost = useCallback(() => { setErr(null); setP(undefined); return posts.getPost(id).then(setP).catch(setErr); }, [id]);
  useEffect(() => { fetchPost(); }, [fetchPost]);
  const img = useImages(p ? [p.image_path, p.author_avatar_path] : []);
  if (err) return <ErrorState error={err} onRetry={fetchPost} title="Could not load this post" />;
  if (p === undefined) return <div className="plain view"><Skeleton n={1} /></div>;
  return (<div className="plain view"><div className="phead"><button className="ghost sm" onClick={() => (history.length > 1 ? history.back() : go('home'))}>‹ Back</button></div>
    {p ? <PostCard p={p} me={me} img={img} go={go} onChange={setP} onDelete={() => go('home')} notify={notify} expanded />
      : <p className="empty">This post is not available. It may have been deleted, or it is only visible to friends.</p>}</div>);
}

/* ---------------- Home ---------------- */
function Snapshot({ go, unread }) {
  const [me, setMe] = useState(null); const [req, setReq] = useState(0); const [views, setViews] = useState(null); const [fresh, setFresh] = useState([]);
  useEffect(() => { profiles.getMyProfile().then((p) => { setMe(p); profiles.myViews(p.id).then(setViews).catch(() => {}); }).catch(() => {});
    friends.incomingRequests().then((r) => setReq(r.length)).catch(() => {}); discover.discover({ mode: 'new', limit: 3 }).then(setFresh).catch(() => {}); }, []);
  const img = useImages([me?.avatar_path, ...fresh.map((p) => p.avatar_path)]);
  if (!me) return <aside className="snap panel"><div className="boot">…</div></aside>;
  return (<aside className="snap panel"><button type="button" className="snaptop who" onClick={() => go('profile')} title="Open my profile"><Avatar src={img[me.avatar_path]} size={64} name={me.display_name || me.username} /><span><b>{me.display_name}</b><small>{me.headline || 'No mood set yet'}</small></span></button>
    <div className="stats3"><button onClick={() => go('messages')}><b>{unread}</b><small>messages</small></button><button onClick={() => go('people')}><b>{req}</b><small>requests</small></button><span><b>{views ?? '–'}</b><small>views</small></span></div>
    <button className="primary wide" onClick={() => go('profile', null, null, true)}>Edit my profile</button>
    {fresh.length > 0 && <><h4>Cool new people</h4><div className="newp">{fresh.map((p) => <button key={p.id} onClick={() => go('profile', p.username)}><Avatar src={img[p.avatar_path]} size={52} name={p.display_name || p.username} /><small>{p.display_name}</small></button>)}</div></>}
  </aside>);
}

export function HomeView({ me, go, notify, unread }) {
  const [tab, setTabRaw] = useState(() => { try { const t = sessionStorage.getItem('fiiyou:tab'); return ['nearby', 'friends', 'events'].includes(t) ? t : 'nearby'; } catch { return 'nearby'; } });
  const setTab = (t) => { setTabRaw(t); try { sessionStorage.setItem('fiiyou:tab', t); } catch {} }; const [loc, setLoc] = useState(''); const [locs, setLocs] = useState([]); const [places, setPlaces] = useState([]);
  useEffect(() => { discover.listLocalities().then(setLocs); social.listPlaces().then(setPlaces).catch(() => {}); }, []);
  const f = useFeed(tab === 'events' ? { kind: 'event', upcoming: true, localityId: loc ? +loc : null } : { onlyFriends: tab === 'friends', localityId: loc ? +loc : null }, notify, me.id);
  return (<div className="plain wide view"><div className="homegrid"><Snapshot go={go} unread={unread} />
    <div className="homemain"><Composer me={me} places={places} onPosted={() => f.load(false)} notify={notify} />
      <div className="tabs"><div role="tablist" aria-label="Feed" className="tabsin"><button role="tab" aria-selected={tab === 'nearby'} className={tab === 'nearby' ? 'on' : ''} onClick={() => setTab('nearby')}>Around you</button><button role="tab" aria-selected={tab === 'friends'} className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>Friend updates</button><button role="tab" aria-selected={tab === 'events'} className={tab === 'events' ? 'on' : ''} onClick={() => setTab('events')}>Events</button></div>
        <LocalityPicker locs={locs} value={loc} onChange={setLoc} emptyLabel="All localities" ariaLabel="Place" pinnedIds={me?.locality_id ? [me.locality_id] : []} /></div>
      <List f={f} me={me} go={go} notify={notify} Icon={tab === 'friends' ? UsersThree : tab === 'events' ? CalendarBlank : ChatsCircle} empty={tab === 'friends' ? 'Nothing from friends yet. Add a few people and their posts show up here.' : tab === 'events' ? 'No upcoming events. Post one and invite your neighbours.' : 'No posts yet. Be the first to say something.'} /></div></div></div>);
}

/* ---------------- Messages ---------------- */
const dayLabel = (iso) => { const d = new Date(iso), t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  return d.toDateString() === t.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }); };
/** Search box for messages. peerId = only inside that chat, otherwise all of my chats. Results come from search_messages() (0029). */
function ChatSearch({ peerId = null, onPick, nameOf, autoFocus = false }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState(null); const seq = useRef(0);
  useEffect(() => {
    const t = q.trim(); const my = ++seq.current;
    if (t.length < 2) { setRes(null); return undefined; }
    const timer = setTimeout(() => social.searchMessages(t, peerId).then((r) => { if (my === seq.current) setRes(r); }).catch(() => { if (my === seq.current) setRes([]); }), 350);
    return () => clearTimeout(timer);
  }, [q, peerId]);
  const clip = (b, t) => { const i = b.toLowerCase().indexOf(t.toLowerCase()); const from = Math.max(0, (i < 0 ? 0 : i) - 24); return (from ? '…' : '') + b.slice(from, from + 90) + (b.length > from + 90 ? '…' : ''); };
  return (<div className="chatfind"><input type="search" autoFocus={autoFocus} value={q} maxLength={60} placeholder={peerId ? 'Search in this chat' : 'Search messages'} aria-label={peerId ? 'Search in this chat' : 'Search all messages'} onChange={(e) => setQ(e.target.value)} />
    {res && <div className="fresults">{!res.length ? <p className="muted">No messages found.</p> : res.map((r) => <button key={r.id} type="button" onClick={() => { onPick(r); setQ(''); setRes(null); }}>
      <b>{r.sender_id === r.peer_id ? nameOf(r.peer_id) : 'You'}{!peerId && <small> · {nameOf(r.peer_id)}</small>}</b><span>{clip(r.body, q.trim())}</span><small>{new Date(r.created_at).toLocaleDateString('en-GB')}</small></button>)}</div>}</div>);
}

export function MessagesView({ me, peer, go, notify, refreshUnread }) {
  const [convs, setConvs] = useState([]); const [fl, setFl] = useState([]); const [cur, setCur] = useState(peer || null);
  // The open chat lives in the address (/chat/<id>), so the phone's Back button goes thread -> conversation list -> where you were before.
  const openChat = (id) => { setCur(id); go('messages', null, id); };
  const closeChat = () => { if (history.state?.fk) history.back(); else go('messages'); };
  useEffect(() => { setCur(peer || null); }, [peer]);   // Back / Forward change the address: follow it
  const [msgs, setMsgs] = useState(null); const [txt, setTxt] = useState(''); const end = useRef(); const inp = useRef(); const [replyTo, setReplyTo] = useState(null); const [editing, setEditing] = useState(null);   // editing = id of the message being edited
  const touch = useTouchScreen(); const [sheet, setSheet] = useState(null); const box = useRef(null); const stick = useRef(true); const initial = useRef(true); const prevLen = useRef(0); const curRef = useRef(cur); curRef.current = cur; const [newBelow, setNewBelow] = useState(false);
  const [pins, setPins] = useState([]); const [peerTyping, setPeerTyping] = useState(false); const [findOpen, setFindOpen] = useState(false); const [gifOpen, setGifOpen] = useState(false); const typing = useRef(null); const typingT = useRef(); const pendingJump = useRef(null);
  const loadConvs = () => social.conversations().then(setConvs).catch(() => {});
  const loadThread = useCallback(async (id) => { try { const m = await social.thread(id); if (curRef.current !== id) return; setMsgs(m); if (m.some((x) => x.sender_id === id && !x.read_at)) { await social.markRead(id); loadConvs(); refreshUnread(); } } catch (e) { if (curRef.current === id) notify(e.message, 'err'); } }, []);   // an answer for a chat you already left is dropped, so it can never show under the wrong name
  useEffect(() => { loadConvs(); friends.listFriends().then(setFl); }, []);
  useEffect(() => { initial.current = true; stick.current = true; prevLen.current = 0; setNewBelow(false); setMsgs(null); setReplyTo(null); setEditing(null); setPins([]); setPeerTyping(false); setFindOpen(false); if (cur) { loadThread(cur); social.listPins(cur).then(setPins).catch(() => {}); } }, [cur]);
  useEffect(() => {   // "is typing…": a private realtime channel between the two of us; silent when Realtime is not available
    if (!cur) return undefined;
    const ch = social.typingChannel(me.id, cur, () => { setPeerTyping(true); clearTimeout(typingT.current); typingT.current = setTimeout(() => setPeerTyping(false), 4000); });
    typing.current = ch; return () => { ch.off(); typing.current = null; clearTimeout(typingT.current); };
  }, [cur]);
  useEffect(() => { setPeerTyping(false); }, [msgs?.length]);   // a new message from them ends the indicator
  useEffect(() => { const el = inp.current; if (!el) return; el.style.height = 'auto'; const h = el.scrollHeight; el.style.height = `${Math.min(124, h)}px`; el.style.overflowY = h > 124 ? 'auto' : 'hidden'; }, [txt, cur]);   // the textarea grows with the message, up to four lines
  useEffect(() => { if (msgs && pendingJump.current) { const id = pendingJump.current; pendingJump.current = null; setTimeout(() => jump(id), 60); } }, [msgs]);
  useEffect(() => {
    const soon = debounce(() => { loadConvs(); if (cur) loadThread(cur); }, 800);   // one refresh per burst of realtime events (mark-as-read fires one event per message)
    const off = social.onMessage(me.id, soon);
    const stop = visiblePoll(() => { if (cur) loadThread(cur); else loadConvs(); }, 60000);   // fallback only; was every 12 s, hidden tabs included
    return () => { off(); stop(); soon.cancel(); };
  }, [cur]);
  const toEnd = (smooth) => { const el = box.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' }); };
  useEffect(() => {   // open a chat = jump to the newest message; a new message only pulls you down if you were already at the bottom (or you sent it)
    if (!msgs) return; const len = msgs.length; const grew = len > prevLen.current; prevLen.current = len;
    if (initial.current) { initial.current = false; toEnd(false); return; }
    if (!grew) return;
    if (stick.current || msgs[len - 1]?.sender_id === me.id) toEnd(true); else setNewBelow(true);
  }, [msgs]);   // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = () => { const el = box.current; if (!el) return; const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120; stick.current = near; if (near) setNewBelow(false); };
  const img = useImages([...convs, ...fl].map((p) => p.avatar_path));
  const who = convs.find((c) => c.id === cur) || fl.find((f) => f.id === cur);
  const send = async (e) => { e?.preventDefault?.(); const body = txt.trim(); if (!body) return; const rep = replyTo; setTxt(''); setReplyTo(null); inp.current?.focus();
    try { const m = await social.sendMessage(cur, body, rep?.id); setMsgs((x) => [...(x || []), m]); loadConvs(); } catch (er) { setTxt(body); setReplyTo(rep); notify(er.message?.includes('rate_limit') ? 'Slow down a little.' : 'Could not send. Are you still friends?', 'err'); } };
  const sendGif = async (gif) => { const rep = replyTo; setReplyTo(null);
    try { const m = await social.sendMessage(cur, encodeGif(gif), rep?.id); setMsgs((x) => [...(x || []), m]); loadConvs(); }
    catch (er) { setReplyTo(rep); notify(er.message?.includes('rate_limit') ? 'Slow down a little.' : 'Could not send that GIF.', 'err'); } };
  const startReply = (m) => { setReplyTo(m); inp.current?.focus(); };
  const pinnedIds = new Set(pins.map((x) => x.message_id));
  const togglePin = async (m) => { try { if (pinnedIds.has(m.id)) await social.unpinMessage(m.id); else await social.pinMessage(cur, m.id); setPins(await social.listPins(cur)); }
    catch (er) { notify(String(er.message).includes('too_many_pins') ? 'You can pin up to 5 messages per chat.' : 'Could not change the pin.', 'err'); } };
  const pickFound = (r) => { if (r.peer_id === cur) { setFindOpen(false); jump(r.id); } else { pendingJump.current = r.id; openChat(r.peer_id); } };
  /** an edited or deleted message of mine comes back from MessageMenu / MessageEditor: swap it in the list, refresh the conversation preview, fix a pending reply */
  const replaceMsg = (nm) => { setMsgs((list) => (list || []).map((x) => (x.id === nm.id ? { ...x, ...nm } : x))); setReplyTo((r) => (r && r.id === nm.id ? { ...r, ...nm } : r)); loadConvs(); };
  const nameOf = (m) => (m.sender_id === me.id ? 'You' : who?.display_name);
  // the quoted message is looked up among the loaded messages first, so a message that is not a reply (reply_to empty) can never show a quote
  const byId = new Map((msgs || []).map((x) => [x.id, x]));
  const replyLabel = (m, q) => { const them = who?.display_name || 'them'; const mine = m.sender_id === me.id, qm = q.sender_id === me.id;
    return mine ? (qm ? 'You replied to yourself' : `You replied to ${them}`) : (qm ? `${them} replied to you` : `${them} replied to themselves`); };
  /** scroll to the quoted message and flash it (only works while it is among the loaded messages) */
  const jump = (id) => { const el = document.getElementById(`m-${id}`); if (!el) return; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1300); };
  // ---- likes on messages: double-tap (phone) or double-click (desktop) a bubble; also the heart button, the heart on the bubble and "Like" in the sheet ----
  const [popId, setPopId] = useState(null); const tapRef = useRef({ id: null, t: 0, timer: 0 });
  useEffect(() => () => clearTimeout(tapRef.current.timer), []);
  const hasLiked = (m) => (m.likers || []).includes(me.id);
  const toggleLike = async (m) => {
    if (m.body === social.DELETED_BODY) return;
    const before = m.likers || []; const on = !before.includes(me.id);
    const apply = (list) => setMsgs((cur) => (cur ? cur.map((x) => (x.id === m.id ? { ...x, likers: list } : x)) : cur));
    apply(on ? [...before, me.id] : before.filter((u) => u !== me.id));   // instant; undone below if the server says no
    if (on) { setPopId(m.id); setTimeout(() => setPopId((p) => (p === m.id ? null : p)), 700); }
    try { await social.setMessageLike(m.id, on); } catch (e) { apply(before); notify(e?.message === 'rate_limit' ? 'Slow down a little: too many likes in a short time.' : friendlyError(e), 'err'); }
  };
  // a single tap opens the options after a short wait (to see whether a second tap follows); a double tap likes; press-and-hold opens them at once
  const bubTap = (m, e) => {
    if (e.target.closest('a, button')) return;
    const tp = tapRef.current; const now = Date.now(); clearTimeout(tp.timer);
    if (tp.id === m.id && now - tp.t < 300) { tapRef.current = { id: null, t: 0, timer: 0 }; toggleLike(m); return; }
    tapRef.current = { id: m.id, t: now, timer: setTimeout(() => { tapRef.current = { id: null, t: 0, timer: 0 }; setSheet(m); }, 280) };
  };
  const heartLabel = (m) => { const them = who?.display_name || 'them'; const mine = hasLiked(m); const other = (m.likers || []).some((u) => u !== me.id); return mine && other ? `You and ${them} liked this message. Press to remove your like` : mine ? 'You liked this message. Press to remove your like' : `${them} liked this message. Press to like it too`; };
  const replyBtn = (m) => <><button type="button" className={`replybtn likebtn${hasLiked(m) ? ' on' : ''}`} aria-label={hasLiked(m) ? 'Remove your like' : 'Like'} aria-pressed={hasLiked(m)} title={hasLiked(m) ? 'Remove your like' : 'Like'} onClick={() => toggleLike(m)}><Heart size={16} weight={hasLiked(m) ? 'fill' : 'bold'} aria-hidden="true" /></button>
    <button type="button" className="replybtn" aria-label="Reply" title="Reply" onClick={() => startReply(m)}><ArrowBendUpLeft size={16} weight="bold" aria-hidden="true" /></button>
    <button type="button" className={`replybtn pinbtn${pinnedIds.has(m.id) ? ' on' : ''}`} aria-label={pinnedIds.has(m.id) ? 'Unpin' : 'Pin'} aria-pressed={pinnedIds.has(m.id)} title={pinnedIds.has(m.id) ? 'Unpin' : 'Pin'} onClick={() => togglePin(m)}><PushPin size={16} weight={pinnedIds.has(m.id) ? 'fill' : 'bold'} aria-hidden="true" /></button></>;
  const lastMineId = [...(msgs || [])].reverse().find((x) => x.sender_id === me.id && x.body !== social.DELETED_BODY)?.id;   // the "Seen" line sits under my newest message
  const fresh = fl.filter((f) => !convs.some((c) => c.id === f.id));
  return (<div className={`chat view${cur ? ' thread' : ''}`}>
    <aside className="clist"><h2 className="clisth">Messages</h2>
      <ChatSearch onPick={pickFound} nameOf={(id) => convs.find((c) => c.id === id)?.display_name || fl.find((f) => f.id === id)?.display_name || 'Chat'} />
      {fresh.length > 0 && <select aria-label="Start a new conversation" value="" onChange={(e) => e.target.value && openChat(e.target.value)}><option value="">New message…</option>{fresh.map((f) => <option key={f.id} value={f.id}>{f.display_name}</option>)}</select>}
      {!convs.length && !fresh.length && <p className="empty">Add friends to start chatting.</p>}
      {convs.map((c) => (<button key={c.id} className={`crow2${cur === c.id ? ' on' : ''}${c.unread > 0 ? ' unread' : ''}`} onClick={() => openChat(c.id)}><Avatar src={img[c.avatar_path]} size={44} />
        <span className="ctext"><span className="cl1"><b>{c.display_name}</b><small>{ago(c.last_at)}</small></span>
          <span className="cl2"><small className="prev">{c.last_mine ? 'You: ' : ''}{previewText(c.last_body)}</small>{c.unread > 0 && <em className="dotb">{c.unread}</em>}</span></span></button>))}</aside>
    <section className="cthread">{cur && who ? (<>
      <header><button className="ghost sm back" onClick={closeChat} aria-label="Back to all conversations">‹</button><button type="button" className="who" aria-label="Open profile" onClick={() => go('profile', who.username)}><Avatar src={img[who.avatar_path]} size={34} /></button><button className="link" onClick={() => go('profile', who.username)}><b>{who.display_name}</b><small>@{who.username}</small></button><button type="button" className="ghost sm findbtn" aria-label="Search in this chat" aria-expanded={findOpen} title="Search in this chat" onClick={() => setFindOpen(!findOpen)}><MagnifyingGlass size={18} weight="bold" aria-hidden="true" /></button></header>
      {findOpen && <ChatSearch peerId={cur} autoFocus onPick={pickFound} nameOf={() => who.display_name} />}
      {pins.filter((x) => x.message.body !== social.DELETED_BODY).length > 0 && <div className="pinbar" role="region" aria-label="Pinned messages"><PushPin size={14} weight="fill" aria-hidden="true" />
        <div>{pins.filter((x) => x.message.body !== social.DELETED_BODY).map((x) => <button key={x.message_id} type="button" onClick={() => jump(x.message_id)} title="Go to the message"><b>{x.message.sender_id === me.id ? 'You' : who.display_name}:</b> {previewText(x.message.body)}</button>)}</div></div>}
      <div className="msgs" ref={box} onScroll={onScroll}>{msgs ? (msgs.length ? msgs.map((m, i) => { const mine = m.sender_id === me.id; const newDay = i === 0 || new Date(m.created_at).toDateString() !== new Date(msgs[i - 1].created_at).toDateString();
        const nx = msgs[i + 1]; const first = newDay || msgs[i - 1].sender_id !== m.sender_id;   // first / last bubble of a run from the same person
        const tail = !nx || nx.sender_id !== m.sender_id || new Date(nx.created_at).toDateString() !== new Date(m.created_at).toDateString();
        const q = m.reply_to ? (byId.get(m.reply_to) || (m.reply?.id ? m.reply : null)) : null;
        const del = m.body === social.DELETED_BODY; const isEd = editing === m.id;
        const sp = del ? null : decodeSharedPost(m.body);   // a shared post: drawn as a card instead of text
        const gf = del ? null : decodeGif(m.body);   // a GIF: drawn as an image instead of text
        return (<Fragment key={m.id}>{newDay && <div className="dsep">{dayLabel(m.created_at)}</div>}<div className={`brow${mine ? ' mine' : ''}${first ? ' first' : ''}${tail ? ' tail' : ''}`} id={`m-${m.id}`}>{!mine && (tail ? <button type="button" className="who" aria-label="Open profile" onClick={() => go('profile', who.username)}><Avatar src={img[who.avatar_path]} size={26} /></button> : <span className="avsp" />)}{mine && !touch && <>{!del && !isEd && <MessageMenu m={m} me={me.id} notify={notify} canEdit={!sp && !gf} onEdit={() => setEditing(m.id)} onDeleted={replaceMsg} />}{!del && replyBtn(m)}</>}
          <div className="bcol">{q && <button type="button" className="rq" onClick={() => jump(q.id)} title="Go to the original message"><span className="rqlab"><ArrowBendUpLeft size={12} weight="bold" aria-hidden="true" />{replyLabel(m, q)}</span><span className="rqtxt">{previewText(q.body)}</span></button>}<div className={`bub${mine ? ' mine' : ''}${sp ? ' hasshare' : ''}${gf ? ' gif' : ''}${del ? ' msgdeleted' : ''}${isEd ? ' editing' : ''}${touch && !del && !isEd ? ' tappable' : ''}`} {...(touch && !del && !isEd ? { onClick: (e) => bubTap(m, e), onContextMenu: (e) => { e.preventDefault(); clearTimeout(tapRef.current.timer); setSheet(m); } } : !touch && !del && !isEd ? { onDoubleClick: (e) => { if (e.target.closest('a, button, input, textarea')) return; window.getSelection()?.removeAllRanges(); toggleLike(m); } } : {})}>{isEd ? <MessageEditor m={m} notify={notify} onCancel={() => setEditing(null)} onSaved={(nm) => { replaceMsg(nm); setEditing(null); }} /> : del ? <p>This message was deleted</p> : sp ? <><SharedPostCard data={sp.data} go={go} />{sp.note && <p>{sp.note}</p>}</> : gf ? <><img className="gifimg" src={gf.gif.url} width={gf.gif.width} height={gf.gif.height} alt="GIF" loading="lazy" decoding="async" referrerPolicy="no-referrer" />{gf.note && <p>{gf.note}</p>}</> : <p>{m.body}</p>}{!isEd && <small>{new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}{m.edited_at && !del && <span className="msgedited"> · edited</span>}</small>}{!del && (m.likers || []).length > 0 && <button type="button" className={`mheart${popId === m.id ? ' pop' : ''}`} aria-label={heartLabel(m)} aria-pressed={hasLiked(m)} onClick={() => toggleLike(m)}><Heart size={13} weight="fill" aria-hidden="true" />{m.likers.length > 1 && <span>{m.likers.length}</span>}</button>}</div>{mine && m.id === lastMineId && m.read_at && <small className="seen">Seen {new Date(m.read_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</small>}</div>{!mine && !del && !touch && replyBtn(m)}</div></Fragment>); }) : <p className="empty">Say hi.</p>) : <div className="boot">…</div>}{newBelow && <button type="button" className="newbelow" onClick={() => { toEnd(true); setNewBelow(false); }}><ArrowDown size={14} weight="bold" aria-hidden="true" />New messages</button>}<div ref={end} /></div>
      {peerTyping && <div className="typing" role="status" aria-live="polite"><span className="tdots" aria-hidden="true"><i /><i /><i /></span>{who.display_name} is typing…</div>}
      {replyTo && <div className="replybar"><ArrowBendUpLeft className="ric" size={18} weight="bold" aria-hidden="true" /><div><b>Replying to {nameOf(replyTo)}</b><span>{previewText(replyTo.body)}</span></div><button type="button" aria-label="Cancel reply" title="Cancel reply" onClick={() => setReplyTo(null)}><X size={16} weight="bold" aria-hidden="true" /></button></div>}
      <div className="inline" role="group" aria-label="Write a message"><button type="button" className="gifbtn" aria-label="Send a GIF" title="Send a GIF" aria-expanded={gifOpen} onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={() => setGifOpen(true)}><Gif size={21} weight="bold" aria-hidden="true" /></button><textarea ref={inp} className="chatbox" rows={1} wrap="soft" aria-label="Message" value={txt} maxLength={1000} placeholder="Write a message…" autoComplete="off" autoCorrect="on" autoCapitalize="sentences" enterKeyHint="send" inputMode="text" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other" onChange={(e) => { setTxt(e.target.value); if (e.target.value) typing.current?.ping(); }} onKeyDown={(e) => { if (e.key === 'Escape' && replyTo) setReplyTo(null); else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e); }} autoFocus />
        {/* no <form> and a textarea, not an input: a one-field form looks like a login to Android autofill (key / card / pin icons above the keyboard). Buttons never take focus, so one tap sends and the keyboard stays. */}
        <button type="button" className="primary sendbtn" aria-label="Send" title="Send" disabled={!txt.trim()} onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={send}><PaperPlaneRight size={20} weight="fill" aria-hidden="true" /></button></div></>)
      : <p className="empty">Pick a conversation.</p>}</section>
    {sheet && <MessageSheet m={sheet} mine={sheet.sender_id === me.id} preview={previewText(sheet.body)} pinned={pinnedIds.has(sheet.id)} liked={hasLiked(sheet)} onLike={() => toggleLike(sheet)} canEdit={!decodeSharedPost(sheet.body) && !decodeGif(sheet.body)} canCopy={!decodeSharedPost(sheet.body) && !decodeGif(sheet.body)} notify={notify}
      onReply={() => startReply(sheet)} onPin={() => togglePin(sheet)} onEdit={() => setEditing(sheet.id)} onDeleted={replaceMsg} onClose={() => setSheet(null)} />}{gifOpen && <GifPicker onPick={sendGif} onClose={() => setGifOpen(false)} />}</div>);
}

/* ---------------- People (discover + friends + requests) ---------------- */
export function PeopleView({ me, go, notify }) {
  const [tab, setTab] = useState('discover'); const [q, setQ] = useState(''); const [loc, setLoc] = useState(''); const [mode, setMode] = useState('random'); const [locs, setLocs] = useState([]);
  const [people, setPeople] = useState([]); const [fl, setFl] = useState([]); const [inc, setInc] = useState([]); const [sent, setSent] = useState({});
  const loadF = () => { friends.listFriends().then(setFl); friends.incomingRequests().then(setInc); };
  useEffect(() => { discover.listLocalities().then(setLocs); loadF(); }, []);
  useEffect(() => { (q.trim().length >= 2 ? discover.searchProfiles(q) : discover.discover({ localityId: loc ? +loc : null, mode })).then(setPeople).catch(() => {}); }, [q, loc, mode]);
  const img = useImages([...people, ...fl, ...inc.map((r) => r.from)].map((p) => p.avatar_path));
  const lname = (id) => locs.find((l) => l.id === id)?.name;
  const act = (fn, msg) => fn().then(() => { notify(msg); loadF(); }).catch((e) => notify(e.message, 'err'));
  const row = (p, extra, sub) => (<div className="row" key={p.id}><Avatar src={img[p.avatar_path]} size={44} /><button className="link" onClick={() => go('profile', p.username)}>{p.display_name}<small>{sub ?? `@${p.username}`}</small></button>{extra}</div>);
  return (<div className="plain view"><div className="tabs">
    {[['discover', 'Discover'], ['friends', `Friends`], ['requests', 'Requests']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l} {k === 'friends' && <span className="count">{fl.length}</span>}{k === 'requests' && inc.length > 0 && <span className="count hot">{inc.length}</span>}</button>)}</div>
    {tab === 'discover' && <><div className="inline"><input placeholder="Search name or @username" value={q} onChange={(e) => setQ(e.target.value)} />
      <LocalityPicker locs={locs} value={loc} onChange={setLoc} emptyLabel="Anywhere" ariaLabel="Place" />
      <select aria-label="Order" value={mode} onChange={(e) => setMode(e.target.value)}><option value="random">Random</option><option value="new">Newest</option></select></div>
      {!people.length && <p className="empty">No one to show.</p>}
      {people.map((p) => row(p, sent[p.id] ? <small>Request sent</small> : <button className="primary sm" onClick={() => friends.sendRequest(p.id).then(() => { setSent({ ...sent, [p.id]: 1 }); notify('Request sent'); }).catch((e) => notify(e.message, 'err'))}>Add</button>,
        [p.headline, lname(p.locality_id)].filter(Boolean).join(' · ') || `@${p.username}`))}</>}
    {tab === 'friends' && (fl.length ? fl.map((f) => row(f, <span className="acts"><button className="primary sm" onClick={() => go('messages', null, f.id)}>Message</button><button className="ghost sm" onClick={async () => (await ask({ title: 'Remove this friend?', message: `${f.display_name} will be removed from your friends.`, confirmLabel: 'Remove', danger: true })) && act(() => friends.removeFriend(f.id), 'Removed')}>Remove</button></span>)) : <p className="empty">No friends yet. Find people in Discover.</p>)}
    {tab === 'requests' && (inc.length ? inc.map((r) => row(r.from, <span className="acts"><button className="primary sm" onClick={() => act(() => friends.acceptRequest(r.id), 'Friend added')}>Accept</button><button className="ghost sm" onClick={() => act(() => friends.declineRequest(r.id), 'Declined')}>Decline</button></span>)) : <p className="empty">No pending requests.</p>)}
  </div>);
}
