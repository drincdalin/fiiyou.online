import test from 'node:test'; import assert from 'node:assert/strict';
import { passwordStrength as s } from '../../src/lib/password.js';

test('empty has no label; short is score 0 and says how many characters are missing', () => {
  assert.equal(s('').label, ''); const r = s('abc'); assert.equal(r.score, 0); assert.match(r.hint, /5 more characters/);
  assert.equal(s('1234567').hint, '1 more character needed');
});
test('well-known passwords are score 0', () => { assert.equal(s('password1').score, 0); assert.equal(s('Qwerty123!').score, 0); });
test('repeated characters and blocks are never above weak', () => { assert.ok(s('aaaaaaaaaaaa').score <= 1); assert.ok(s('abababababab').score <= 1); });
test('username or email part inside the password is weak', () => { assert.equal(s('dalin-2024-x', { username: 'dalin' }).score, 1); assert.equal(s('maria.pop99', { email: 'maria.pop@x.ro' }).score, 1); });
test('longer and more varied scores higher, max 4', () => {
  assert.ok(s('tr4in-Lamp-Stone-91').score >= s('kitchen77').score); assert.equal(s('tr4in-Lamp-Stone-91x!').score, 4);
  for (const p of ['kitchen77', 'plum-orbit-sandal', 'Zx9!kLm2#qWe']) { const r = s(p).score; assert.ok(r >= 1 && r <= 4); }
});
