import test from 'node:test'; import assert from 'node:assert/strict';
import { contrast, blend, readableOn, themeContrast } from '../../src/lib/contrast.js';

const near = (a, b, d = 0.01) => assert.ok(Math.abs(a - b) <= d, `${a} is not within ${d} of ${b}`);

test('contrast matches the WCAG reference values', () => {
  near(contrast('#000000', '#ffffff'), 21, 0.001); near(contrast('#ffffff', '#ffffff'), 1, 0.001);
  near(contrast('#767676', '#ffffff'), 4.54, 0.02);   // the well-known "just passes AA" grey
  assert.equal(contrast('#123456', '#123456'), 1); assert.equal(contrast('#123456', 'red'), 21);   // unusable input is not reported as a failure
});
test('blend mixes by opacity', () => {
  assert.equal(blend('#ffffff', '#000000', 0), '#000000'); assert.equal(blend('#ffffff', '#000000', 1), '#ffffff');
  assert.equal(blend('#ffffff', '#000000', 0.5), '#808080');
});
test('readableOn leaves a passing colour alone and fixes a failing one in the right direction', () => {
  assert.equal(readableOn('#f2f2f2', '#141414'), '#f2f2f2');
  const onDark = readableOn('#3a3a3a', '#141414'); assert.ok(contrast(onDark, '#141414') >= 4.5); assert.ok(onDark > '#3a3a3a');   // lightened
  const onLight = readableOn('#bbbbbb', '#ffffff'); assert.ok(contrast(onLight, '#ffffff') >= 4.5); assert.ok(onLight < '#bbbbbb');   // darkened
});
test('readableOn satisfies several surfaces at once', () => {
  const c = readableOn('#888888', ['#101010', '#303030']); assert.ok(contrast(c, '#101010') >= 4.5 && contrast(c, '#303030') >= 4.5);
});
const base = { bg_color: '#0b0b0b', frame_color: '#000000', card_color: '#141414', text_color: '#f2f2f2', link_color: '#ff5a62', frame_opacity: '70', card_opacity: '100' };
test('the default theme passes', () => { const r = themeContrast(base); assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks)); });
test('a low-contrast text colour is reported with a fix that passes', () => {
  const r = themeContrast({ ...base, text_color: '#2a2a2a' }); const t = r.checks.find((c) => c.id === 'text');
  assert.equal(t.ok, false); assert.ok(t.ratio < 4.5); assert.ok(contrast(t.fix, r.surfaces.card) >= 4.5);
});
test('see-through cards are judged against what is behind them', () => {
  const light = { ...base, bg_color: '#ffffff', frame_color: '#ffffff', card_color: '#000000', card_opacity: '0', text_color: '#f2f2f2' };
  assert.equal(themeContrast(light).checks.find((c) => c.id === 'text').ok, false);   // an invisible black card leaves white text on a white page
});
