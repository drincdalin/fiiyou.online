// Groups notifications the way people read them: "Ana and 3 others liked your post".
// Likes are merged per kind, whichever post / photo / comment they are on (two lines that both read "Ana and 2 others liked your post"
// cannot be told apart anyway). Comments are merged per post, because the line opens that post. A friend request, reply or mention always stays on its own.
const GROUP_BY = {
  post_like: () => 'all',
  photo_like: () => 'all',
  comment_like: () => 'all',
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
