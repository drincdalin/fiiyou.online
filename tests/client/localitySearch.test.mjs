import test from 'node:test'; import assert from 'node:assert/strict';
import { norm, searchLocalities } from '../../src/lib/localitySearch.js';

const L = (id, name, commune = '', county = 'Bihor') => ({ id, name, commune, county });
const locs = [L(1, 'Oradea', 'Oradea'), L(2, 'Beiuș', 'Beiuș'), L(3, 'Pocioveliște', 'Curățele'), L(4, 'Nimăiești', 'Curățele'), L(5, 'Curățele', 'Curățele'),
  L(6, 'Săliște (Budureasa)', 'Budureasa'), L(7, 'Săliște (Remetea)', 'Remetea'), L(8, 'Ștei', 'Ștei'), L(9, 'Alba Iulia', 'Alba Iulia', 'Alba')];
const names = (r) => r.rows.filter((x) => x.kind === 'loc').map((x) => x.l.name);

test('accents and both comma/cedilla letters are ignored', () => {
  assert.equal(norm('Ștei Țara Pocioveliște'), 'stei tara pocioveliste');
  assert.deepEqual(names(searchLocalities(locs, 'pocioveliste')), ['Pocioveliște']);
  assert.deepEqual(names(searchLocalities(locs, 'STEI')), ['Ștei']);
  assert.deepEqual(names(searchLocalities(locs, 'ștei')), ['Ștei']);
});
test('a village is also found by its commune; the place itself ranks first', () => {
  assert.deepEqual(names(searchLocalities(locs, 'curatele')), ['Curățele', 'Nimăiești', 'Pocioveliște']);
});
test('names starting with the text come before names that only contain it', () => {
  const r = names(searchLocalities([L(1, 'Cetatea'), L(2, 'Beiuș'), L(3, 'Ucetea'), L(4, 'Cetea')], 'cet'));
  assert.deepEqual(r.slice(0, 2).sort(), ['Cetatea', 'Cetea']); assert.equal(r[2], 'Ucetea');
});
test('several words must all match', () => {
  assert.deepEqual(names(searchLocalities(locs, 'saliste rem')), ['Săliște (Remetea)']);
  assert.deepEqual(names(searchLocalities(locs, 'zzz')), []);
});
test('no search text: the empty choice, then your place, then recents, without duplicates', () => {
  const r = searchLocalities(locs, '', { pinnedIds: [3], recentIds: ['3', '1', '99'], emptyLabel: 'Anywhere' });
  assert.deepEqual(r.rows.map((x) => x.kind === 'loc' ? x.l.name : x.label), ['Anywhere', 'Your place', 'Pocioveliște', 'Recent', 'Oradea']);
});
test('never returns more than 60 rows but says how many more there are', () => {
  const many = Array.from({ length: 200 }, (_, i) => L(i, `Vale ${i}`));
  const r = searchLocalities(many, 'vale'); assert.equal(r.rows.length, 60); assert.equal(r.more, 140);
});
