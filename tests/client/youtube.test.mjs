import test from 'node:test'; import assert from 'node:assert/strict';
import { parseYouTubeId, fmtTime, ytThumb, cleanArtist } from '../../src/lib/youtube.js';
import { createClock } from '../../src/lib/playerClock.js';

test('parseYouTubeId', () => {
  assert.equal(parseYouTubeId(' https://youtu.be/dQw4w9WgXcQ?si=abc '), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseYouTubeId('https://www.youtube.com/watch?list=x&v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  for (const bad of ['https://evil.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/', 'https://www.youtube.com/watch', 'dQw4w9WgXcQ', undefined, 5]) assert.equal(parseYouTubeId(bad), null, String(bad));
});
test('fmtTime', () => {
  assert.equal(fmtTime(0), '0:00'); assert.equal(fmtTime(83.9), '1:23'); assert.equal(fmtTime(3725), '1:02:05');
  for (const v of [NaN, -4, Infinity, undefined, null]) assert.equal(fmtTime(v), '0:00');
});
test('ytThumb / cleanArtist', () => {
  assert.equal(ytThumb('abc', 'maxresdefault'), 'https://i.ytimg.com/vi/abc/maxresdefault.jpg'); assert.ok(ytThumb('abc').endsWith('/hqdefault.jpg'));
  assert.equal(cleanArtist('Daft Punk - Topic'), 'Daft Punk'); assert.equal(cleanArtist('AdeleVEVO'), 'Adele'); assert.equal(cleanArtist(undefined), '');
});
test('clock: stable snapshot until something changes, clamps, notifies', () => {
  const c = createClock(); const a = c.get(); let n = 0; const off = c.subscribe(() => n++);
  c.set({ position: 0 }); assert.equal(c.get(), a); assert.equal(n, 0);
  c.set({ position: 12.5, duration: 200, buffered: 7 }); assert.deepEqual(c.get(), { position: 12.5, duration: 200, buffered: 1 }); assert.equal(n, 1);
  c.set({ position: NaN, duration: -3 }); assert.deepEqual(c.get(), { position: 0, duration: 0, buffered: 1 });
  off(); c.set({ position: 9 }); assert.equal(n, 2);
});
