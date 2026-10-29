import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Heart, ChatCircle, UserPlus, UsersThree } from '@phosphor-icons/react';
import { social } from '../index.js';
import { Avatar, ago, useImages } from './shared.jsx';
import { Verified } from './parts.jsx';

// ---------------------------------------------------------------------------------------------
// The only calls this file makes to your backend (see api/social.js, 0020_notifications.sql and 0025_wall_notifications.sql):
//   social.listNotifications()        -> [{ id, type, created_at, read, post_id?, photo_id?, profile_username, actor: { username, display_name, avatar_path, is_official } }]
//                                         profile_username = the RECIPIENT's own username (i.e. my profile), added in api/social.js
//   types: post_like, photo_like, comment, wall_comment, friend_request, friend_accept
//   social.unreadNotifications()      -> number
//   social.markNotificationsRead()    -> marks all of my notifications as read
//   social.onNotification(meId, cb)   -> realtime hook, returns an unsubscribe function
// ---------------------------------------------------------------------------------------------
const KINDS = {
  post_like: [Heart, 'liked your post'],
  photo_like: [Heart, 'liked your photo'],
  comment: [ChatCircle, 'commented on your post'],
  wall_comment: [ChatCircle, 'commented on your wall'],
  friend_request: [UserPlus, 'sent you a friend request'],
  friend_accept: [UsersThree, 'accepted your friend request'],
};

/** Unread count for the badge, kept fresh by a 30 s poll + realtime. `tick` changes whenever a new one arrives. Call it in App. */
export function useNotifCount(meId) {
  const [n, setN] = useState(0); const [tick, setTick] = useState(0);
  const refresh = useCallback(() => social.unreadNotifications().then((c) => setN(c || 0)).catch(() => {}), []);
  useEffect(() => {
    if (!meId) return undefined;
    refresh(); const t = setInterval(refresh, 30000);
    const off = social.onNotification(meId, () => { refresh(); setTick((x) => x + 1); });
    return () => { clearInterval(t); off?.(); };
  }, [meId, refresh]);
  return { n, setN, tick };
}

/** The list that sits inside the account menu. It exists only while the menu is open; closing the menu marks everything as read. */
export default function NotificationList({ go, notify, tick, onRead }) {
  const [rows, setRows] = useState(null);
  const rowsRef = useRef(null); rowsRef.current = rows;
  const load = useCallback(() => social.listNotifications().then((r) => setRows(r || [])).catch(() => { setRows([]); notify('Could not load notifications', 'err'); }), []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [tick]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {   // menu closed: only after the list was really shown (the dev double-mount must not mark anything read)
    if (rowsRef.current?.some((r) => !r.read)) { social.markNotificationsRead().catch(() => {}); onRead(); }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const img = useImages((rows || []).map((r) => r.actor?.avatar_path));
  // Post likes / post comments open the post. Wall comments and photo likes happened on MY profile, so they open my profile.
  const visit = (r) => {
    if (r.post_id) go('post', r.post_id);
    else if ((r.type === 'wall_comment' || r.type === 'photo_like') && r.profile_username) go('profile', r.profile_username);
    else if (r.actor) go('profile', r.actor.username);
  };

  return (<section className="nsec" aria-label="Notifications">
    <h3 className="nhead"><Bell size={16} weight="bold" aria-hidden="true" />Notifications</h3>
    {!rows ? <div className="boot">…</div> : !rows.length ? <p className="muted nempty">Nothing yet. Likes and comments on your posts, photos and wall will show up here.</p>
      : <ul className="nlist">{rows.map((r) => { const [Icon, text] = KINDS[r.type] || [Bell, 'did something']; return (
        <li key={r.id}><button type="button" role="menuitem" className={`nrow${r.read ? '' : ' new'}`} onClick={() => visit(r)}>
          <span className="nav2"><Avatar src={img[r.actor?.avatar_path]} size={36} /><i className="nic"><Icon size={10} weight="fill" aria-hidden="true" /></i></span>
          <span className="ntxt"><span><b>{r.actor?.display_name || r.actor?.username || 'Someone'}</b>{r.actor?.is_official && <Verified />} {text}</span><small>{ago(r.created_at)}</small></span></button></li>); })}</ul>}
  </section>);
}
