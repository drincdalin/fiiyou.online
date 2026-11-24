import test from 'node:test'; import assert from 'node:assert/strict';
import { cleanPhoneLayout, cleanPhoneTheme } from '../../src/lib/phoneLayout.js';

const flow = { type: 'about' };
const sticker = { type: 'sticker' };

test('flow card: order / visible / size are kept and out-of-range values are clamped', () => {
  assert.deepEqual(cleanPhoneLayout(flow, { order: 3, visible: false, w: 300, h: 180 }), { order: 3, visible: false, w: 300, h: 180 });
  assert.deepEqual(cleanPhoneLayout(flow, { order: 99, w: 9999, h: -5 }), { order: 79, w: 2000, h: 40 });
  assert.deepEqual(cleanPhoneLayout(flow, { order: 3.7, w: 300.4 }), { order: 4, w: 300 });
});

test('flow card: wrong types and unknown keys are dropped, not rejected', () => {
  assert.deepEqual(cleanPhoneLayout(flow, { order: 'three', evil: 1, visible: 'yes' }), {});
  assert.deepEqual(cleanPhoneLayout(flow, { visible: true }), { visible: true });
});

test('sticker: pin + y + scale are kept and clamped', () => {
  assert.deepEqual(cleanPhoneLayout(sticker, { pin: { card: '11111111-2222-3333-4444-555555555555', v: 'b' }, y: -120, scale: 1.5 }),
    { pin: { card: '11111111-2222-3333-4444-555555555555', v: 'b' }, y: -120, scale: 1.5 });
  assert.deepEqual(cleanPhoneLayout(sticker, { pin: { card: null, v: 't' }, y: 999999, scale: 9 }),
    { pin: { card: null, v: 't' }, y: 30000, scale: 5 });
});

test('sticker: a bad pin is dropped and flow keys do not apply', () => {
  assert.deepEqual(cleanPhoneLayout(sticker, { pin: { card: 'not-a-uuid', v: 'b' } }), {});
  assert.deepEqual(cleanPhoneLayout(sticker, { order: 1, w: 2 }), {});
});

test('sticker: an uppercase pin id is dropped (the database accepts lowercase only)', () => {
  assert.deepEqual(cleanPhoneLayout(sticker, { pin: { card: '11111111-2222-3333-4444-55555555555A', v: 'b' } }), {});
  assert.deepEqual(cleanPhoneLayout(sticker, { pin: { card: '11111111-2222-3333-4444-555555555555', v: 'b' }, y: -10 }),
    { pin: { card: '11111111-2222-3333-4444-555555555555', v: 'b' }, y: -10 });
});

test('non-object input yields an empty layout (fall back to desktop)', () => {
  for (const bad of [null, undefined, 'x', 5, ['a'], []]) assert.deepEqual(cleanPhoneLayout(flow, bad), {});
  assert.deepEqual(cleanPhoneLayout(null, { order: 1 }), {});
});

test('phone theme: only bg_image + font_size survive, the shared accent is dropped', () => {
  assert.deepEqual(cleanPhoneTheme({ bg_image: '99999999-9999-4999-8999-999999999999/bg.webp', font_size: '18' }),
    { bg_image: '99999999-9999-4999-8999-999999999999/bg.webp', font_size: '18' });
  assert.deepEqual(cleanPhoneTheme({ accent_color: '#ff0000', bg_color: '#000', font_size: '13' }), { font_size: '13' });
  assert.deepEqual(cleanPhoneTheme({ bg_image: '../../etc/passwd', font_size: '99' }), {});
});

test('phone theme: non-object input yields an empty override', () => {
  for (const bad of [null, undefined, 'x', 5, ['a']]) assert.deepEqual(cleanPhoneTheme(bad), {});
});
