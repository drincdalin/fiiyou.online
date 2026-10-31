import test from 'node:test'; import assert from 'node:assert/strict';
import { groupNotifications, actorsLabel } from '../../src/lib/notifGroups.js';
const A = (id, name) => ({ id, username: name.toLowerCase(), display_name: name });
let n = 0; const row = (type, actor, extra = {}) => ({ id: `n${++n}`, type, read: false, actor, ...extra });

test('likes merge across posts and say how many different posts', () => {
  const g = groupNotifications([row('post_like', A(1, 'Ana'), { post_id: 'p1' }), row('post_like', A(2, 'Mihai'), { post_id: 'p1' }), row('post_like', A(3, 'Ioana'), { post_id: 'p2' })]);
  assert.equal(g.length, 1); assert.equal(g[0].rows.length, 3); assert.equal(g[0].targetCount, 2); assert.equal(actorsLabel(g[0].actors), 'Ana and 2 others');
  assert.equal(groupNotifications([row('post_like', A(1, 'Ana'), { post_id: 'p1' }), row('post_like', A(2, 'B'), { post_id: 'p1' })])[0].targetCount, 1);
});
test('comments stay separate per post; likes and comments never mix', () => {
  const g = groupNotifications([row('comment', A(1, 'A'), { post_id: 'p1' }), row('comment', A(2, 'B'), { post_id: 'p2' }), row('post_like', A(3, 'C'), { post_id: 'p1' })]);
  assert.equal(g.length, 3);
});
test('3+ people -> "and N others", the same person twice counts once', () => {
  const g = groupNotifications([1, 2, 3, 3].map((i) => row('comment', A(i, `P${i}`), { post_id: 'p' })));
  assert.equal(g.length, 1); assert.equal(g[0].actors.length, 3); assert.equal(actorsLabel(g[0].actors), 'P1 and 2 others');
});
test('friend requests, mentions and replies are never merged', () => {
  const g = groupNotifications([row('friend_request', A(1, 'A')), row('friend_request', A(2, 'B')), row('mention', A(3, 'C'), { post_id: 'p' }), row('reply', A(3, 'C'), { post_id: 'p' })]);
  assert.equal(g.length, 4);
});
test('unread tracking per group and order of the newest row is kept', () => {
  const r1 = row('post_like', A(1, 'A'), { post_id: 'p', read: true }); const r2 = row('post_like', A(2, 'B'), { post_id: 'p' }); const x = row('friend_accept', A(3, 'C'));
  const g = groupNotifications([x, r1, r2]); assert.equal(g[0].latest.id, x.id);
  assert.deepEqual(g[1].unreadIds, [r2.id]); assert.equal(g[1].unread, true); assert.deepEqual(g[1].ids, [r1.id, r2.id]);
  assert.equal(groupNotifications([r1])[0].unread, false);
});
test('empty and missing actor are fine', () => {
  assert.deepEqual(groupNotifications(null), []); assert.equal(actorsLabel([]), 'Someone');
  assert.equal(groupNotifications([row('post_like', null, { post_id: 'p' })])[0].actors[0].name, 'Someone');
});
