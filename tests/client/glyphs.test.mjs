import test from 'node:test';
import assert from 'node:assert/strict';
import { fixGlyphs } from '../../src/ui/customCssRender.js';

test('built-in fonts and plain text are never touched (the Romanian letter swap is only for uploaded fonts)', () => {
  assert.equal(fixGlyphs('Curățele Șoimuș', '700 20px "Ubuntu Sans", system-ui'), 'Curățele Șoimuș');
  assert.equal(fixGlyphs('Hello', '700 20px "uf-abc", serif'), 'Hello');
  assert.equal(fixGlyphs('Curățele', '700 20px "uf-abc", serif'), 'Curățele');   // no canvas here (node): nothing can be measured, so nothing changes
});
