import test from 'node:test'; import assert from 'node:assert/strict';
import { saveDraft, loadDraft, clearDraft, mergeDraft, draftMediaPaths, MAX_AGE } from '../../src/lib/draftStore.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const U = '11111111-2222-3333-4444-555555555555';
const fresh = () => ({ theme: { bg_color: '#000' }, origBg: undefined, origFont: undefined, origMusic: {}, css: [], top: ['f1'],
  cards: [{ id: 'a', type: 'about', title: 'About me', content: { body: 'old' }, visible: true }, { id: 'b', type: 'text', title: 'T', content: { body: '' }, visible: true }],
  fields: { display_name: 'Dalin', headline: '', locality_id: 1, wall_policy: 'everyone', show_on_map: false, music: {} } });

test('save / load / clear round trip', () => {
  const s = mem(); const d = fresh(); assert.equal(saveDraft(U, d, { storage: s, now: 1000 }), true);
  assert.deepEqual(loadDraft(U, { storage: s, now: 2000 }).draft, JSON.parse(JSON.stringify(d)));   // JSON drops undefined
  clearDraft(U, { storage: s }); assert.equal(loadDraft(U, { storage: s }), null);
});
test('drafts older than 24h are ignored and removed', () => {
  const s = mem(); saveDraft(U, fresh(), { storage: s, now: 0 });
  assert.equal(loadDraft(U, { storage: s, now: MAX_AGE + 1 }), null); assert.equal(s._m.size, 0);
});
test('malformed data is ignored and removed', () => {
  for (const bad of ['{', '"x"', '{"v":1,"t":1,"draft":{"cards":"no"}}', '{"v":99,"t":1,"draft":{"cards":[],"theme":{}}}']) {
    const s = mem(); s.setItem('fiiyou_draft_' + U, bad); assert.equal(loadDraft(U, { storage: s, now: 5 }), null); assert.equal(s._m.size, 0);
  }
});
test('works without storage (private mode)', () => {
  assert.equal(saveDraft(U, fresh(), { storage: null }), false); assert.equal(loadDraft(U, { storage: null }), null);
  const broken = { setItem() { throw new Error('quota'); }, getItem() { throw new Error('x'); }, removeItem() {} };
  assert.equal(saveDraft(U, fresh(), { storage: broken }), false); assert.equal(loadDraft(U, { storage: broken }), null);
});
test('mergeDraft: edits win, deleted cards drop, new cards stay, orig* come from the fresh draft', () => {
  const f = fresh(); f.origBg = 'saved/bg.webp'; f.cards.push({ id: 'new', type: 'links', title: 'L', content: { links: [] }, visible: true });
  const stored = { theme: { bg_color: '#123456' }, origBg: 'stale', cards: [{ id: 'gone', type: 'text', title: 'x' }, { id: 'b', title: 'Edited' }, { id: 'a', content: { body: 'typed' } }],
    top: ['f2'], css: [{ x: 1 }], fields: { display_name: 'New name', evil: 'ignored' } };
  const m = mergeDraft(stored, f);
  assert.deepEqual(m.cards.map((c) => c.id), ['b', 'a', 'new']);
  assert.equal(m.cards[0].title, 'Edited'); assert.equal(m.cards[0].type, 'text'); assert.equal(m.cards[1].content.body, 'typed');
  assert.equal(m.theme.bg_color, '#123456'); assert.equal(m.origBg, 'saved/bg.webp');
  assert.equal(m.fields.display_name, 'New name'); assert.equal('evil' in m.fields, false); assert.equal(m.fields.locality_id, 1);
  assert.deepEqual(m.top, ['f2']);
});
test('mergeDraft ignores wrong types', () => {
  const m = mergeDraft({ theme: 'x', cards: 'y', top: [1, 2], css: 'z', fields: 5 }, fresh());
  assert.deepEqual(m.top, ['f1']); assert.deepEqual(m.css, []); assert.equal(m.cards.length, 2); assert.equal(m.theme.bg_color, '#000');
});
test('draftMediaPaths finds storage paths anywhere in the draft', () => {
  const s = mem(); const d = fresh(); d.theme.bg_image = `${U}/bg.webp`; d.cards[0].content.images = [`${U}/a.webp`, 'not a path'];
  d.fields.music = { cover: `${U}/c.webp`, audio: `${U}/s.mp3` }; saveDraft(U, d, { storage: s });
  assert.deepEqual([...draftMediaPaths(U, { storage: s })].sort(), [`${U}/a.webp`, `${U}/bg.webp`, `${U}/c.webp`, `${U}/s.mp3`]);
  assert.equal(draftMediaPaths('other', { storage: s }).size, 0);
});
