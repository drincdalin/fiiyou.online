// Groups notifications the way people read them: "Ana and 3 others liked your post".
// A group is always ONE thing: likes are merged per post / photo / comment, comments per post, so "Ana and 3 others liked your post"
// means exactly those 4 people liked that one post (it used to merge likes from every post into one line, which made the number
// look wrong next to the post's own like count). A friend request, reply or mention always stays on its own.
const GROUP_BY = {
  post_like: (r) => r.post_id,
  photo_like: (r) => r.photo_id,
  comment_like: (r) => r.comment_id,
  comment: (r) => r.post_id,
  wall_comment: () => 'wall',
};
const targetOf = (r) => r.post_id || r.photo_id || r.comment_id || null;

/** rows: newest first. -> [{ key, type, latest, rows, ids, unreadIds, actors: [{id, name}] , unread }] in the order of each group's newest row. */
export function groupNotifications(rows) {
  const out = []; const idx = new Map();
  for (const r of rows || []) {
    const g = GROUP_BY[r.type]; const target = g ? g(r) : null;
    const key = target != null ? `${r.type}:${target}` : `one:${r.id}`;
    let grp = idx.get(key);
    if (!grp) { grp = { key, type: r.type, latest: r, rows: [], ids: [], unreadIds: [], actors: [], targets: new Set() }; idx.set(key, grp); out.push(grp); }
    grp.targets.add(targetOf(r)); grp.rows.push(r); grp.ids.push(r.id); if (!r.read) grp.unreadIds.push(r.id);
    const a = r.actor; const aid = a?.id || a?.username || r.id;
    if (!grp.actors.some((x) => x.id === aid)) grp.actors.push({ id: aid, name: a?.display_name || a?.username || 'Someone', official: !!a?.is_official });
  }
  return out.map((g) => ({ ...g, targetCount: g.targets.size, unread: g.unreadIds.length > 0 }));
}

/** "Ana", "Ana and Mihai", "Ana and 3 others" */
export function actorsLabel(actors) {
  const n = actors.length;
  if (n <= 1) return actors[0]?.name || 'Someone';
  if (n === 2) return `${actors[0].name} and ${actors[1].name}`;
  return `${actors[0].name} and ${n - 1} others`;
}

/** No grouping at all: one entry per notification, same shape as groupNotifications(). This is what the full /notifications page shows. */
export function ungroupNotifications(rows) {
  return (rows || []).map((r) => {
    const a = r.actor; const aid = a?.id || a?.username || r.id;
    return { key: `one:${r.id}`, type: r.type, latest: r, rows: [r], ids: [r.id], unreadIds: r.read ? [] : [r.id], targets: new Set([targetOf(r)]), targetCount: 1, unread: !r.read,
      actors: [{ id: aid, name: a?.display_name || a?.username || 'Someone', official: !!a?.is_official }] };
  });
}
