import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, ArrowRight, Heart, ChatCircle, UserPlus, UsersThree, ArrowBendUpLeft, At } from '@phosphor-icons/react';
import { social } from '../index.js';
import { Avatar, ago, useImages } from './shared.jsx';
import { Verified } from './parts.jsx';
import { groupNotifications, actorsLabel } from '../lib/notifGroups.js';

// ---------------------------------------------------------------------------------------------
// The only calls this file makes to your backend (see api/social.js, 0020_notifications.sql and 0025_wall_notifications.sql):
//   social.listNotifications()        -> [{ id, type, created_at, read, post_id?, photo_id?, comment_id?, profile_username, actor: { username, display_name, avatar_path, is_official } }]
//                                         profile_username = the RECIPIENT's own username (i.e. my profile), added in api/social.js
//   types: post_like, photo_like, comment, wall_comment, friend_request, friend_accept,
//          comment_like, reply, mention (in a post), comment_mention (in a comment)  <- 0028_comment_likes_replies_mentions.sql
//   social.unreadNotifications()      -> number
//   social.markNotificationsReadIds(ids) -> marks those notifications as read
//   social.onNotification(meId, cb)   -> realtime hook, returns an unsubscribe function
// Notifications of the same kind on the same post / photo / comment are shown as one line ("Ana and 3 others liked your post").
// Opening the list IS seeing it: everything shown is marked read straight away (no buttons to tap). Lines that were new when the list
// opened keep their highlight until it is closed, so you can still tell what is new.
// ---------------------------------------------------------------------------------------------
const KINDS = {
  post_like: [Heart, 'liked your post'],
  photo_like: [Heart, 'liked your photo'],
  comment: [ChatCircle, 'commented on your post'],
  wall_comment: [ChatCircle, 'commented on your wall'],
  friend_request: [UserPlus, 'sent you a friend request'],
  friend_accept: [UsersThree, 'accepted your friend request'],
  comment_like: [Heart, 'liked your comment'],
  reply: [ArrowBendUpLeft, 'replied to your comment'],
  mention: [At, 'mentioned you in a post'],
  comment_mention: [At, 'mentioned you in a comment'],
};

// when one line stands for likes on several different things
const PLURAL = { post_like: 'liked your posts', photo_like: 'liked your photos', comment_like: 'liked your comments' };

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

/** The list that sits inside the account menu (and on the /notifications page). Opening it marks what it shows as read. `onRead(remainingUnread)` keeps the badge in step. */
export function NotificationList({ go, notify, tick, onRead, limit }) {
  const [rows, setRows] = useState(null);
  const fresh = useRef(new Set());   // ids that were unread when they arrived here: they stay highlighted while this list is open
  const load = useCallback(() => social.listNotifications().then((r) => {
    const list = r || [];
    const unseen = list.filter((x) => !x.read).map((x) => x.id);
    unseen.forEach((id) => fresh.current.add(id));
    setRows(list.map((x) => ({ ...x, read: !fresh.current.has(x.id) })));   // "read" here only drives the highlight
    if (unseen.length) {   // seen by opening the list: tell the database and the badge (only these ids, never ones that arrive a moment later)
      onRead(0);
      social.markNotificationsReadIds(unseen).catch(() => onRead(unseen.length));
    }
  }).catch(() => { setRows((x) => x || []); notify('Could not load notifications', 'err'); }), []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [tick]);   // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => groupNotifications(rows || []), [rows]);
  const img = useImages(groups.map((g) => g.latest.actor?.avatar_path));
  const shown = limit ? groups.slice(0, limit) : groups;   // the account menu shows the latest few; the page shows all

  // Post likes / post comments open the post. Wall comments and photo likes happened on MY profile, so they open my profile.
  const visit = (g) => {
    const r = g.latest;
    if (r.post_id) go('post', r.post_id);
    else if ((r.type === 'wall_comment' || r.type === 'photo_like') && r.profile_username) go('profile', r.profile_username);
    else if (r.actor) go('profile', r.actor.username);
  };

  return (<section className="nsec npage" aria-label="Notifications">
    {!rows ? <div className="boot">…</div> : !groups.length ? <p className="muted nempty">Nothing yet. Likes, replies and mentions will show up here.</p>
      : <ul className="nlist">{shown.map((g) => { const [Icon, single] = KINDS[g.type] || [Bell, 'did something']; const text = g.targetCount > 1 && PLURAL[g.type] ? PLURAL[g.type] : single; const r = g.latest; const count = g.rows.length; return (
        <li key={g.key} className="nitem">
          <button type="button" className={`nrow${g.unread ? ' new' : ''}`} onClick={() => visit(g)}>
            <span className="nav2"><Avatar src={img[r.actor?.avatar_path]} size={36} /><i className="nic"><Icon size={10} weight="fill" aria-hidden="true" /></i></span>
            <span className="ntxt"><span><b>{actorsLabel(g.actors)}</b>{g.actors.length === 1 && g.actors[0].official && <Verified />} {text}{count > g.actors.length && g.actors.length === 1 && g.targetCount <= 1 ? ` (${count})` : ''}</span><small>{ago(r.created_at)}</small></span></button>
        </li>); })}</ul>}
    {limit && groups.length > limit && <button type="button" className="nseeall" onClick={() => go('notifications')}>See all notifications<ArrowRight size={14} weight="bold" aria-hidden="true" /></button>}
  </section>);
}

/** The /notifications page. */
export default function NotificationsView(props) {
  return (<div className="plain view"><h2>Notifications</h2><div className="panel npanel"><NotificationList {...props} /></div></div>);
}
