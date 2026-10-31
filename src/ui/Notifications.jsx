import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Check, Heart, ChatCircle, UserPlus, UsersThree, ArrowBendUpLeft, At } from '@phosphor-icons/react';
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
//   social.markNotificationRead(id)   -> marks ONE notification as read
//   social.markNotificationsRead()    -> marks all of my notifications as read
//   social.onNotification(meId, cb)   -> realtime hook, returns an unsubscribe function
// Notifications of the same kind on the same post / photo / comment are shown as one line ("Ana and 3 others liked your post").
// Nothing is marked read just because the menu was opened: tap a line, tap its check mark, or use "Mark all as read".
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

/** The list that sits inside the account menu. `onRead(remainingUnread)` keeps the badge in step. */
export function NotificationList({ go, notify, tick, onRead }) {
  const [rows, setRows] = useState(null);
  const load = useCallback(() => social.listNotifications().then((r) => setRows(r || [])).catch(() => { setRows((x) => x || []); notify('Could not load notifications', 'err'); }), []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [tick]);   // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => groupNotifications(rows || []), [rows]);
  const img = useImages(groups.map((g) => g.latest.actor?.avatar_path));
  const unreadTotal = (rows || []).filter((r) => !r.read).length;

  // optimistic: mark in the list first, ask the database, put it back if that fails
  const markIds = async (ids) => {
    if (!ids.length) return;
    const set = new Set(ids); const before = rows;
    const next = (rows || []).map((r) => (set.has(r.id) ? { ...r, read: true } : r)); setRows(next); onRead(next.filter((r) => !r.read).length);
    try { await Promise.all(ids.map((id) => social.markNotificationRead(id))); }
    catch { setRows(before); onRead((before || []).filter((r) => !r.read).length); notify('Could not mark as read', 'err'); }
  };
  const markAll = async () => {
    const before = rows; setRows((rows || []).map((r) => ({ ...r, read: true }))); onRead(0);
    try { await social.markNotificationsRead(); } catch { setRows(before); onRead((before || []).filter((r) => !r.read).length); notify('Could not mark as read', 'err'); }
  };
  // Post likes / post comments open the post. Wall comments and photo likes happened on MY profile, so they open my profile.
  const visit = (g) => {
    const r = g.latest; markIds(g.unreadIds);
    if (r.post_id) go('post', r.post_id);
    else if ((r.type === 'wall_comment' || r.type === 'photo_like') && r.profile_username) go('profile', r.profile_username);
    else if (r.actor) go('profile', r.actor.username);
  };

  return (<section className="nsec npage" aria-label="Notifications">
    <div className="nhead">{unreadTotal > 0 ? `${unreadTotal} unread` : 'All caught up'}
      {unreadTotal > 0 && <button type="button" className="ghost sm nmarkall" onClick={markAll}>Mark all as read</button>}</div>
    {!rows ? <div className="boot">…</div> : !groups.length ? <p className="muted nempty">Nothing yet. Likes, replies and mentions will show up here.</p>
      : <ul className="nlist">{groups.map((g) => { const [Icon, single] = KINDS[g.type] || [Bell, 'did something']; const text = g.targetCount > 1 && PLURAL[g.type] ? PLURAL[g.type] : single; const r = g.latest; const count = g.rows.length; return (
        <li key={g.key} className="nitem">
          <button type="button" className={`nrow${g.unread ? ' new' : ''}`} onClick={() => visit(g)}>
            <span className="nav2"><Avatar src={img[r.actor?.avatar_path]} size={36} /><i className="nic"><Icon size={10} weight="fill" aria-hidden="true" /></i></span>
            <span className="ntxt"><span><b>{actorsLabel(g.actors)}</b>{g.actors.length === 1 && g.actors[0].official && <Verified />} {text}{count > g.actors.length && g.actors.length === 1 && g.targetCount <= 1 ? ` (${count})` : ''}</span><small>{ago(r.created_at)}</small></span></button>
          {g.unread && <button type="button" className="nread" aria-label="Mark as read" title="Mark as read" onClick={() => markIds(g.unreadIds)}><Check size={14} weight="bold" aria-hidden="true" /></button>}
        </li>); })}</ul>}
  </section>);
}

/** The /notifications page. */
export default function NotificationsView(props) {
  return (<div className="plain view"><h2>Notifications</h2><div className="panel npanel"><NotificationList {...props} /></div></div>);
}
