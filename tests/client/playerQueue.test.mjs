import test from 'node:test'; import assert from 'node:assert/strict';
import { makeTrack, emptyQueue, currentOf, reduce, pickNext, pickPrev } from '../../src/lib/playerQueue.js';

const T = (n) => makeTrack({ src: `https://youtu.be/${String(n).padEnd(11, 'x').slice(0, 11)}`, title: n });   // 11-character video ids
const load = (n, o) => reduce(emptyQueue(o), { type: 'set', tracks: Array.from({ length: n }, (_, i) => T(`s${i}`)), start: 0 });
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('makeTrack: YouTube links of every shape share one key, bad links are refused', () => {
  const ids = ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'https://m.youtube.com/live/dQw4w9WgXcQ'];
  for (const src of ids) { const t = makeTrack({ src }); assert.equal(t.kind, 'yt', src); assert.equal(t.videoId, 'dQw4w9WgXcQ'); assert.equal(t.key, 'yt:dQw4w9WgXcQ'); }
  for (const src of ['', 'javascript:alert(1)', 'http://x.com/a.mp3', 'ftp://x/a.mp3', 'https://youtube.com/watch?v=short', 'not a url', null]) assert.equal(makeTrack({ src }), null, String(src));
  assert.equal(makeTrack(null), null);
});
test('makeTrack: audio files (uploaded or direct links) are not supported; re-wrapping a track gives a fresh qid but the same key', () => {
  for (const src of ['https://x.supabase.co/sign/audio/u/1.mp3?token=aaa', 'https://cdn.example.com/a.mp3', 'https://cdn.example.com/a.m4a', 'blob:https://x/1']) assert.equal(makeTrack({ src, key: 'u/1.mp3' }), null, src);
  const a = makeTrack({ src: 'https://youtu.be/dQw4w9WgXcQ', cover: 'https://x/c.webp' }, 'card');
  assert.equal(a.kind, 'yt'); assert.equal(a.key, 'yt:dQw4w9WgXcQ'); assert.equal(a.origin, 'card'); assert.equal(a.cover, 'https://x/c.webp');
  const b = makeTrack(a); assert.equal(b.key, a.key); assert.notEqual(b.qid, a.qid);
  assert.equal(makeTrack({ src: 'https://youtu.be/dQw4w9WgXcQ', cover: 'javascript:x' }).cover, '');
});
test('set / add / currentOf', () => {
  let s = emptyQueue(); assert.equal(currentOf(s), null); assert.equal(pickNext(s), -1); assert.equal(pickPrev(s), -1);
  s = reduce(s, { type: 'add', tracks: [T('a'), T('b')] }); assert.equal(s.cursor, 0); assert.equal(currentOf(s).title, 'a');
  s = reduce(s, { type: 'set', tracks: [T('x'), T('y'), T('z')], start: 2 }); assert.equal(currentOf(s).title, 'z');
  assert.equal(reduce(s, { type: 'set', tracks: [], start: 0 }).cursor, -1);
  assert.equal(reduce(emptyQueue({ shuffle: true, repeat: 'all' }), { type: 'clear' }).repeat, 'all');   // settings survive clearing
});
test('in order: next walks forward, stops at the end, wraps with repeat-all, loops a single song', () => {
  let s = load(3); assert.equal(pickNext(s), 1);
  s = reduce(s, { type: 'goto', index: 2, dir: 'next' }); assert.equal(pickNext(s), -1); assert.equal(pickNext(s, Math.random, { auto: true }), -1);
  s = reduce(s, { type: 'repeat', mode: 'all' }); assert.equal(pickNext(s), 0);
  const one = load(1, { repeat: 'all' }); assert.equal(pickNext(one), 0);
  assert.equal(pickNext(load(1)), -1);
});
test('repeat-one replays on auto-advance but Next still moves on', () => {
  const s = load(3, { repeat: 'one' }); assert.equal(pickNext(s, Math.random, { auto: true }), 0); assert.equal(pickNext(s, Math.random, { auto: false }), 1);
});
test('previous: in order and with repeat-all', () => {
  let s = load(3); assert.equal(pickPrev(s), -1);
  s = reduce(s, { type: 'goto', index: 1, dir: 'next' }); assert.equal(pickPrev(s), 0);
  s = reduce(load(3, { repeat: 'all' }), {}); assert.equal(pickPrev(s), 2);
  assert.equal(pickPrev(load(1, { repeat: 'all' })), -1);
});
test('shuffle plays every song once before ending, never repeats the current one, and wraps with repeat-all', () => {
  let s = load(4, { shuffle: true }); const heard = new Set([0]);
  for (let k = 0; k < 3; k++) { const i = pickNext(s, Math.random); assert.ok(i > 0 || i === 0 ? i >= 0 : false); assert.ok(!heard.has(i), `repeated ${i}`); heard.add(i); s = reduce(s, { type: 'goto', index: i, dir: 'next' }); }
  assert.equal(heard.size, 4); assert.equal(pickNext(s), -1);
  s = reduce(s, { type: 'repeat', mode: 'all' }); const again = pickNext(s, seq(0.99)); assert.ok(again >= 0 && again !== s.cursor);
});
test('shuffle: previous goes back along the real path', () => {
  let s = load(5, { shuffle: true }); const path = [0];
  for (let k = 0; k < 3; k++) { const i = pickNext(s, Math.random); s = reduce(s, { type: 'goto', index: i, dir: 'next' }); path.push(i); }
  for (let k = 2; k >= 0; k--) { const p = pickPrev(s); assert.equal(p, path[k]); s = reduce(s, { type: 'goto', index: p, dir: 'prev' }); }
  assert.equal(pickPrev(s), -1);
});
test('play next: goes right after the current song, in pick order, and wins over shuffle', () => {
  let s = load(3); const a = T('A'), b = T('B');
  s = reduce(s, { type: 'next-up', tracks: [a] }); s = reduce(s, { type: 'next-up', tracks: [b] });
  assert.deepEqual(s.queue.map((t) => t.title), ['s0', 'A', 'B', 's1', 's2']);
  const sh = reduce(s, { type: 'shuffle', on: true }); assert.equal(sh.queue[pickNext(sh, () => 0.99)].title, 'A');
  assert.equal(currentOf(reduce(emptyQueue(), { type: 'next-up', tracks: [a] })).title, 'A');
});
test('remove keeps the cursor on the right song', () => {
  let s = load(4); s = reduce(s, { type: 'goto', index: 2, dir: 'next' }); const cur = currentOf(s).qid;
  let r = reduce(s, { type: 'remove', qid: s.queue[0].qid }); assert.equal(currentOf(r).qid, cur);            // before the cursor: shifts down
  r = reduce(s, { type: 'remove', qid: s.queue[3].qid }); assert.equal(currentOf(r).qid, cur);                // after: untouched
  r = reduce(s, { type: 'remove', qid: cur }); assert.equal(currentOf(r).title, 's3');                          // the playing song: next one slides in
  const last = reduce(s, { type: 'goto', index: 3, dir: 'next' }); r = reduce(last, { type: 'remove', qid: currentOf(last).qid }); assert.equal(currentOf(r).title, 's2');
  assert.equal(reduce(load(1), { type: 'remove', qid: load(1).queue[0].qid }).cursor, 0);   // unknown qid: no change
  const one = load(1); assert.equal(reduce(one, { type: 'remove', qid: one.queue[0].qid }).cursor, -1);
});
test('clear-upcoming keeps only the playing song', () => {
  let s = load(4); s = reduce(s, { type: 'goto', index: 2, dir: 'next' }); s = reduce(s, { type: 'clear-upcoming' });
  assert.equal(s.queue.length, 1); assert.equal(currentOf(s).title, 's2');
});
