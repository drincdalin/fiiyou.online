import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeGif, decodeGif, isGif } from '../../src/lib/gifs.js';

const gif = { url: 'https://gifjif.com/media/ab/cd/123.tiny.webp', width: 480, height: 360 };

test('encodeGif / decodeGif round trip', () => {
  const body = encodeGif(gif, 'nice one');
  assert.equal(isGif(body), true);
  const d = decodeGif(body);
  assert.equal(d.gif.url, gif.url);
  assert.equal(d.gif.width, 480);
  assert.equal(d.gif.height, 360);
  assert.equal(d.note, 'nice one');
});

test('the stored body is a path, not a link, so comment spam rules do not count it', () => {
  const body = encodeGif(gif);
  assert.doesNotMatch(body, /https?:\/\//i);
  assert.match(body, /"u":"\/media\/ab\/cd\/123\.tiny\.webp"/);
});

test('only GIF-provider images are accepted', () => {
  for (const url of ['https://evil.example/x.webp', 'http://gifjif.com/x.gif', 'https://gifjif.com/x.svg', 'javascript:alert(1)']) {
    assert.throws(() => encodeGif({ ...gif, url }), /not allowed/);
  }
});

test('decode ignores ordinary text and damaged bodies', () => {
  assert.equal(decodeGif('hello'), null);
  assert.equal(decodeGif('fiiyou:gif:not json'), null);
  assert.equal(decodeGif('fiiyou:gif:{"v":1,"u":"https://evil.example/x.gif"}'), null);
  assert.equal(decodeGif('fiiyou:gif:{"v":1,"u":"/x.svg"}'), null);
});

test('a comment body stays within the 500 character limit', () => {
  const body = encodeGif(gif, 'x'.repeat(1000));
  assert.ok(body.length <= 1000);
  assert.equal(decodeGif(body)?.gif.url, gif.url);
});
