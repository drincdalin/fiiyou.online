import { useCallback, useEffect, useState } from 'react';
import { friends } from '../index.js';
import { useImages, Avatar } from './shared.jsx';
import { ask } from './dialog.jsx';
import { friendlyError } from './errors.jsx';

/** People: your Friends and the Requests waiting for you. Finding new people lives in Search (discover + search are one thing). */
export function PeopleView({ go, notify, onInvite }) {
  const [tab, setTab] = useState('friends');
  const [fl, setFl] = useState(null); const [inc, setInc] = useState([]);
  const loadF = useCallback(() => Promise.all([friends.listFriends().then(setFl), friends.incomingRequests().then(setInc)]).catch(() => setFl((x) => x || [])), []);
  useEffect(() => { loadF(); }, [loadF]);

  const img = useImages([...(fl || []), ...inc.map((r) => r.from)].map((p) => p?.avatar_path));
  const act = (fn, msg) => fn().then(() => { notify(msg); loadF(); }).catch((e) => notify(friendlyError(e), 'err'));
  const row = (p, extra) => (<div className="row" key={p.id}><Avatar src={img[p.avatar_path]} size={44} /><button className="link" onClick={() => go('profile', p.username)}>{p.display_name}<small>@{p.username}</small></button>{extra}</div>);

  return (<div className="plain view"><div className="tabs">
    {[['friends', 'Friends'], ['requests', 'Requests']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l} {k === 'friends' && fl && <span className="count">{fl.length}</span>}{k === 'requests' && inc.length > 0 && <span className="count hot">{inc.length}</span>}</button>)}
    <span className="acts" style={{ marginLeft: 'auto' }}><button className="primary sm" onClick={() => go('search')}>Find people</button>{onInvite && <button className="ghost sm" onClick={onInvite}>Invite</button>}</span></div>
    {tab === 'friends' && (fl === null ? <p className="empty" role="status">Loading…</p> : fl.length ? fl.map((f) => row(f, <span className="acts"><button className="primary sm" onClick={() => go('messages', null, f.id)}>Message</button><button className="ghost sm" onClick={async () => (await ask({ title: 'Remove this friend?', message: `${f.display_name} will be removed from your friends.`, confirmLabel: 'Remove', danger: true })) && act(() => friends.removeFriend(f.id), 'Removed')}>Remove</button></span>))
      : <div className="empty"><p>No friends yet.</p><button className="primary" onClick={() => go('search')}>Find people</button></div>)}
    {tab === 'requests' && (inc.length ? inc.map((r) => row(r.from, <span className="acts"><button className="primary sm" onClick={() => act(() => friends.acceptRequest(r.id), 'Friend added')}>Accept</button><button className="ghost sm" onClick={() => act(() => friends.declineRequest(r.id), 'Declined')}>Decline</button></span>)) : <p className="empty">No pending requests.</p>)}
  </div>);
}
