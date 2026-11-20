import test from 'node:test';
import assert from 'node:assert/strict';
import { MOODS, INTERESTS, VIBE_IDS, joinNatural, composeAbout, matchPreset } from '../../src/ui/onboardingData.js';
import { PRESETS } from '../../src/ui/themes.js';

test('joinNatural reads like a sentence', () => {
  assert.equal(joinNatural([]), '');
  assert.equal(joinNatural(['music']), 'music');
  assert.equal(joinNatural(['music', 'art']), 'music and art');
  assert.equal(joinNatural(['music', 'art', 'code']), 'music, art and code');
});

test('composeAbout: nothing picked and nothing typed gives an empty body', () => {
  assert.equal(composeAbout([], ''), '');
  assert.equal(composeAbout([], '   '), '');
});

test('composeAbout: picks become one sentence, typed text follows', () => {
  assert.equal(composeAbout(['Music', 'Photography']), 'Into music and photography.');
  assert.equal(composeAbout(['Music'], ' I make beats. '), 'Into music.\n\nI make beats.');
  assert.equal(composeAbout([], 'Just this'), 'Just this');
});

test('composeAbout never goes over the card limit', () => {
  assert.equal(composeAbout(['Music'], 'x'.repeat(900)).length, 600);
  assert.equal(composeAbout([], 'y'.repeat(50), 20).length, 20);
});

test('every onboarding vibe exists in the presets and the default is first', () => {
  const ids = new Set(PRESETS.map((p) => p.id));
  for (const id of VIBE_IDS) assert.ok(ids.has(id), `missing preset ${id}`);
  assert.equal(VIBE_IDS[0], 'mono');
  assert.equal(new Set(VIBE_IDS).size, VIBE_IDS.length);
});

test('mood chips fit the headline limit, interest ids are unique', () => {
  for (const m of MOODS) assert.ok(m.length <= 80);
  assert.equal(new Set(INTERESTS.map((i) => i.id)).size, INTERESTS.length);
  for (const i of [...MOODS, ...INTERESTS.map((x) => x.label)]) assert.ok(!/[\u2014\u2013]/.test(i), 'no dashes in copy');
});

test('matchPreset finds a preset by its look and returns null for custom or empty themes', () => {
  const tokyo = PRESETS.find((p) => p.id === 'tokyo');
  assert.equal(matchPreset(PRESETS, tokyo.theme), 'tokyo');
  assert.equal(matchPreset(PRESETS, { ...tokyo.theme, radius: '0' }), 'tokyo');   // shape tweaks do not change which look it is
  assert.equal(matchPreset(PRESETS, { ...tokyo.theme, accent_color: '#123456' }), null);
  assert.equal(matchPreset(PRESETS, {}), null);
  assert.equal(matchPreset(PRESETS, null), null);
});
