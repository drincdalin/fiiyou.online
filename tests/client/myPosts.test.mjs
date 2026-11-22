import test from 'node:test'; import assert from 'node:assert/strict';
import { excerpt, filterParams, countLabel, allIds, KIND_LABEL } from '../../src/lib/myPosts.js';

test('excerpt keeps short text, collapses whitespace and cuts long text at a word', () => {
  assert.equal(excerpt('hello   world\n\nagain'), 'hello world again');
  assert.equal(excerpt(''), ''); assert.equal(excerpt(null), '');
  const long = 'word '.repeat(60); const e = excerpt(long, 50);
  assert.ok(e.endsWith('…') && e.length <= 51 && !e.includes('wor…'), e);
  assert.equal(excerpt('x'.repeat(200), 20), `${'x'.repeat(20)}…`);   // one long word: cut where it has to be
});
test('filterParams maps the screen filters to the query arguments', () => {
  assert.deepEqual(filterParams(), { kind: null, visibility: null, q: null });
  assert.deepEqual(filterParams({ kind: 'event', friendsOnly: true, q: '  picnic ' }), { kind: 'event', visibility: 'friends', q: 'picnic' });
  assert.deepEqual(filterParams({ kind: '', q: '   ' }), { kind: null, visibility: null, q: null });
});
test('countLabel reads naturally', () => {
  assert.equal(countLabel(0), 'No posts'); assert.equal(countLabel(1), '1 post'); assert.equal(countLabel(12), '12 posts');
  assert.equal(countLabel(2, 'question'), '2 questions');
});
test('allIds and KIND_LABEL', () => { assert.deepEqual(allIds([{ id: 'a' }, { id: 'b' }]), ['a', 'b']); assert.deepEqual(allIds(null), []); assert.equal(KIND_LABEL.ask, 'Question'); });
