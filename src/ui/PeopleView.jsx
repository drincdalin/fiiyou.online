import { useCallback, useEffect, useRef, useState } from 'react';
import { friends, discover } from '../index.js';
import { useImages, Avatar } from './shared.jsx';
import { ask } from './dialog.jsx';
import { ErrorState, friendlyError } from './errors.jsx';

const useDebounced = (v, ms) => { const [x, setX] = useState(v); useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t); }, [v, ms]); return x; };

/** People: Discover (search by name or @username, filter by locality), Friends, Requests.
 *  Replaces PeopleView in views.jsx. Search ignores diacritics ("stefan" finds "Ștefan"), respects the locality filter, waits for you to stop typing,
 *  and every row shows where you stand with that person (friend, request sent, wants to be your friend). */
export function PeopleView({ me, go, notify, onInvite }) {
  const [tab, setTab] = useState('discover'); const [q, setQ] = useState(''); const [loc, setLoc] = useState(''); const [mode, setMode] = useState('random'); const [locs, setLocs] = useState([]);
  const [people, setPeople] = useState(null); const [perr, setPerr] = useState(null);
  const [fl, setFl] = useState([]); const [inc, setInc] = useState([]); const [out, setOut] = useState([]);
  const dq = useDebounced(q.trim(), 300); const searching = dq.length >= 2; const tooShort = q.trim().length === 1;
  const seq = useRef(0);

  const loadF = useCallback(() => Promise.all([friends.listFriends().then(setFl), friends.incomingRequests().then(setInc), friends.outgoingRequests().then(setOut)]).catch(() => {}), []);
  useEffect(() => { discover.listLocalities().then(setLocs).catch(() => {}); loadF(); }, [loadF]);

  const loadPeople = useCallback(() => {
    const my = ++seq.current; setPerr(null);
    return (searching ? discover.searchProfiles(dq, 20, loc ? +loc : null) : discover.discover({ localityId: loc ? +loc : null, mode }))
      .then((r) => { if (my === seq.current) setPeople(r.filter((p) => p.id !== me.id)); })
      .catch((e) => { if (my === seq.current) { setPerr(e); setPeople([]); } });
  }, [dq, searching, loc, mode, me.id]);
  useEffect(() => { setPeople(null); loadPeople(); }, [loadPeople]);

  const img = useImages([...(people || []), ...fl, ...inc.map((r) => r.from)].map((p) => p.avatar_path));
  const lname = (id) => locs.find((l) => l.id === id)?.name;
  const isFriend = (id) => fl.some((f) => f.id === id); const sentTo = (id) => out.some((r) => r.to?.id === id); const incFrom = (id) => inc.find((r) => r.from?.id === id);
  const act = (fn, msg) => fn().then(() => { notify(msg); loadF(); }).catch((e) => notify(friendlyError(e), 'err'));
  const add = (p) => friends.sendRequest(p.id).then(() => { notify('Request sent'); loadF(); }).catch((e) => notify(friendlyError(e), 'err'));
  const row = (p, extra, sub) => (<div className="row" key={p.id}><Avatar src={img[p.avatar_path]} size={44} /><button className="link" onClick={() => go('profile', p.username)}>{p.display_name}<small>{sub ?? `@${p.username}`}</small></button>{extra}</div>);
  const status = (p) => {
    if (isFriend(p.id)) return <span className="acts"><small>Friends</small><button className="ghost sm" onClick={() => go('messages', null, p.id)}>Message</button></span>;
    const r = incFrom(p.id); if (r) return <button className="primary sm" onClick={() => act(() => friends.acceptRequest(r.id), 'Friend added')}>Accept</button>;
    if (sentTo(p.id)) return <small>Request sent</small>;
    return <button className="primary sm" onClick={() => add(p)}>Add</button>;
  };

  return (<div className="plain view"><div className="tabs">
    {[['discover', 'Discover'], ['friends', 'Friends'], ['requests', 'Requests']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l} {k === 'friends' && <span className="count">{fl.length}</span>}{k === 'requests' && inc.length > 0 && <span className="count hot">{inc.length}</span>}</button>)}
    {onInvite && <button className="ghost sm" onClick={onInvite} style={{ marginLeft: 'auto' }}>Invite friends</button>}</div>
    {tab === 'discover' && <><div className="inline"><input type="search" placeholder="Search name or @username" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
      <select value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Locality"><option value="">Anywhere</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      {!searching && <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Order"><option value="random">Random</option><option value="new">Newest</option></select>}</div>
      {tooShort && <p className="muted" role="status">Type at least 2 letters to search.</p>}
      {perr ? <ErrorState error={perr} onRetry={loadPeople} title="Could not load people" />
        : people === null ? <p className="empty" role="status">Loading…</p>
        : !people.length ? <div className="empty"><p>{searching ? `No one matches “${dq}”${loc ? ` in ${lname(+loc) || 'this locality'}` : ''}.` : loc ? `No one new in ${lname(+loc) || 'this locality'} yet.` : 'No one to show yet.'}</p>
          {onInvite && <button className="primary" onClick={onInvite}>Invite someone</button>}</div>
        : people.map((p) => row(p, status(p), [p.headline, lname(p.locality_id)].filter(Boolean).join(' · ') || `@${p.username}`))}</>}
    {tab === 'friends' && (fl.length ? fl.map((f) => row(f, <span className="acts"><button className="primary sm" onClick={() => go('messages', null, f.id)}>Message</button><button className="ghost sm" onClick={async () => (await ask({ title: 'Remove this friend?', message: `${f.display_name} will be removed from your friends.`, confirmLabel: 'Remove', danger: true })) && act(() => friends.removeFriend(f.id), 'Removed')}>Remove</button></span>)) : <p className="empty">No friends yet. Find people in Discover.</p>)}
    {tab === 'requests' && (inc.length ? inc.map((r) => row(r.from, <span className="acts"><button className="primary sm" onClick={() => act(() => friends.acceptRequest(r.id), 'Friend added')}>Accept</button><button className="ghost sm" onClick={() => act(() => friends.declineRequest(r.id), 'Declined')}>Decline</button></span>)) : <p className="empty">No pending requests.</p>)}
  </div>);
}
