import test from 'node:test'; import assert from 'node:assert/strict';
import { savePostDraft, loadPostDraft, clearPostDraft, MAX_AGE, postDraftKey } from '../../src/lib/postDraft.js';
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const U = 'u1';

test('round trip keeps only the known text fields', () => {
  const s = mem(); savePostDraft(U, 'home', { body: 'salut', kind: 'ask', visibility: 'friends', evil: 'x', place: '' }, { storage: s, now: 10 });
  assert.deepEqual(loadPostDraft(U, 'home', { storage: s, now: 11 }), { body: 'salut', kind: 'ask', visibility: 'friends', place: '' });
});
test('drafts are per person and per place', () => {
  const s = mem(); savePostDraft(U, 'home', { body: 'a' }, { storage: s }); savePostDraft(U, 'place:1', { body: 'b' }, { storage: s });
  assert.equal(loadPostDraft(U, 'place:1', { storage: s }).body, 'b'); assert.equal(loadPostDraft('u2', 'home', { storage: s }), null);
});
test('an empty draft removes the stored one', () => {
  const s = mem(); savePostDraft(U, 'home', { body: 'a' }, { storage: s }); savePostDraft(U, 'home', { body: '  ', kind: 'status' }, { storage: s });
  assert.equal(s._m.size, 0);
});
test('old and damaged drafts are ignored and removed', () => {
  const s = mem(); savePostDraft(U, 'home', { body: 'a' }, { storage: s, now: 0 });
  assert.equal(loadPostDraft(U, 'home', { storage: s, now: MAX_AGE + 1 }), null); assert.equal(s._m.size, 0);
  s.setItem(postDraftKey(U, 'home'), '{nope'); assert.equal(loadPostDraft(U, 'home', { storage: s }), null); assert.equal(s._m.size, 0);
});
test('clear works, and no storage or a throwing storage never throws', () => {
  const s = mem(); savePostDraft(U, 'home', { body: 'a' }, { storage: s }); clearPostDraft(U, 'home', { storage: s }); assert.equal(s._m.size, 0);
  const bad = { setItem() { throw new Error('quota'); }, getItem() { throw new Error('x'); }, removeItem() { throw new Error('y'); } };
  savePostDraft(U, 'home', { body: 'a' }, { storage: bad }); assert.equal(loadPostDraft(U, 'home', { storage: bad }), null); clearPostDraft(U, 'home', { storage: bad });
  assert.equal(loadPostDraft(U, 'home', { storage: null }), null);
});
