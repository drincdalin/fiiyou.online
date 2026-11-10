import test from 'node:test';
import assert from 'node:assert/strict';
import { plainError } from '../../src/lib/plainError.js';
import { safeGeometry } from '../../src/lib/cardGeometry.js';

test('the sticker position error people actually saw becomes a sentence they can act on', () => {
  const m = plainError({ message: 'new row for relation "profile_cards" violates check constraint "profile_cards_x_check"', code: '23514' });
  assert.match(m, /placed too far off the page/); assert.doesNotMatch(m, /profile_cards|constraint|relation/);
});
test('other rules, codes and technical messages never leak', () => {
  assert.match(plainError({ message: 'new row for relation "profiles" violates check constraint "profiles_bio_check"' }), /bio can be up to 500/);
  assert.match(plainError({ message: 'new row for relation "x" violates check constraint "some_future_check"' }), /not allowed/);
  assert.equal(plainError(new Error('rate_limit')), 'You are doing that a little too fast. Wait a moment and try again.');
  assert.match(plainError({ message: 'duplicate key value violates unique constraint "profiles_username_key"', code: '23505' }), /username is already taken/);
  assert.match(plainError({ message: 'new row violates row-level security policy for table "posts"' }), /not allowed/);
  assert.match(plainError({ message: 'JWT expired' }), /session ended/);
  assert.match(plainError({ message: 'The object exceeded the maximum allowed size' }), /too big/);
  assert.match(plainError({ message: 'null value in column "body" of relation "posts" violates not-null constraint' }), /required is missing/);
  assert.match(plainError({ message: 'Could not find the function public.foo(bar) in the schema cache' }), /not available yet/);
  for (const raw of ['relation "x" does not exist weirdly', 'TypeError: Cannot read properties of undefined', 'syntax error at or near "select"', 'P0001: boom constraint']) assert.doesNotMatch(plainError(raw), /relation|TypeError|syntax|constraint|P0001/i);
});
test('messages that are already written for people pass through', () => {
  assert.equal(plainError(new Error('That username is taken.')), 'That username is taken.');
  assert.equal(plainError(''), 'Something went wrong on our side. Please try again in a moment.');
  assert.equal(plainError(undefined, 'Could not save.'), 'Could not save.');
});
test('card numbers are pulled inside what the database accepts', () => {
  const c = safeGeometry({ x: -612, y: 9000, w: 3, h: NaN, z: 5000, rotation: 400, title: 'keep' });
  assert.deepEqual(c, { x: -500, y: 5000, w: 40, h: 200, z: 1000, rotation: 180, title: 'keep' });
  assert.deepEqual(safeGeometry({ x: 12.6, w: '300.4' }), { x: 13, w: 300 });   // only the keys present are touched, fractions are rounded
  assert.deepEqual(safeGeometry({ visible: true }), { visible: true });
});
