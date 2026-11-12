import test from 'node:test'; import assert from 'node:assert/strict';
import { parseGeonames, build, toCsv, toSql, parseCsv, slugify, fixRo } from '../../scripts/build-localities.mjs';

// GeoNames RO.txt line: id, name, ascii, alt, lat, lng, class, code, cc, cc2, admin1, admin2, admin3, admin4, pop, elev, dem, tz, date
const L = (id, name, lat, lng, adm1, adm2, code = 'PPL', pop = 100) => [id, name, name, '', lat, lng, 'P', code, 'RO', '', adm1, adm2, '', '', pop, '', '', 'Europe/Bucharest', '2020-01-01'].join('\t');
const GEO = [
  L(1, 'Pocioveliște', 46.70139, 22.44028, '05', '111'), L(2, 'Nimăiești', 46.68278, 22.39139, '05', '111'), L(3, 'Curăţele', 46.7, 22.417, '05', '111', 'PPLA3'),
  L(4, 'Beiuş', 46.66, 22.35, '05', '222', 'PPLA2', 10000),                 // cedilla spelling, as GeoNames has it
  L(5, 'Săliște', 46.5, 22.5, '05', '333'), L(6, 'Săliște', 46.8, 22.2, '05', '444'),   // two villages, same name
  L(7, 'Vechi', 46.1, 22.1, '05', '333', 'PPLH'),                          // historical: skipped
  L(8, 'Sibiu', 45.8, 24.15, '33', '555', 'PPLA'),                         // other county: skipped
  L(9, 'Centru', 46.0, 22.0, '05', '222', 'PPLX'),                         // city section: skipped by default
].join('\n');
const admin1 = new Map([['05', 'Bihor County'], ['33', 'Județul Sibiu']]);   // GeoNames spells county names differently from file to file
const admin2 = new Map([['RO.05.111', 'Comuna Curăţele'], ['RO.05.222', 'Municipiul Beiuş'], ['RO.05.333', 'Comuna Budureasa'], ['RO.05.444', 'Comuna Remetea']]);
const geo = parseGeonames(GEO, { admin1, admin2, counties: new Set(['bihor']), sections: false });

test('reads villages only, right county, comma-below letters, commune named', () => {
  assert.deepEqual(geo.map((g) => g.name).sort(), ['Beiuș', 'Curățele', 'Nimăiești', 'Pocioveliște', 'Săliște', 'Săliște']);
  assert.equal(geo.find((g) => g.name === 'Pocioveliște').commune, 'Curățele'); assert.equal(geo.find((g) => g.name === 'Beiuș').commune, 'Beiuș');
  assert.equal(fixRo('Ştei Ţara'), 'Ștei Țara'); assert.equal(slugify('Șuncuiuș'), 'suncuius');
});
test('your ids / slugs / names stay, wrong coordinates are corrected, missing villages are added', () => {
  const existing = parseCsv('id,slug,name,lat,lng\r\n813,oradea,Oradea,47.0458,21.9183\r\n814,beius,Beiuș,46.6508,22.3483\r\n900,salaiste,Săliște,46.79,22.21\r\n901,nimaiesti,Nimăiești,46.6508,22.3483');
  const { rows, report, added } = build({ geo, existing });
  const get = (s) => rows.find((r) => r.slug === s);
  assert.equal(get('beius').id, '814'); assert.equal(get('beius').lat, 46.66);              // moved ~1 km? close enough -> corrected only if > 1.5 km
  assert.equal(get('nimaiesti').id, '901'); assert.equal(get('nimaiesti').lat, 46.68278);   // was pinned on Beiuș, now on its own spot
  assert.deepEqual(report.notFound.map((e) => e.slug), ['oradea']);                         // kept untouched (not in the sample)
  assert.equal(get('oradea').lat, 47.0458);
  assert.equal(get('salaiste').lng, 22.2);                                                  // picked the Săliște nearest to the old pin
  assert.ok(get('pocioveliste') && get('pocioveliste').id === '');                          // new
  assert.ok(get('saliste-budureasa'), 'the other Săliște gets the commune in its name'); assert.equal(get('saliste-budureasa').name, 'Săliște (Budureasa)');
  assert.equal(added, 3);   // Pocioveliște, Curățele, the second Săliște
});
test('output formats', () => {
  const { rows } = build({ geo, existing: [] });
  assert.match(toCsv(rows), /^id,slug,name,lat,lng,commune,county\n/); const sql = toSql(rows); assert.match(sql, /on conflict \(slug\) do update set lat = excluded\.lat/);
  assert.match(toSql([{ slug: 'x', name: "O'Neil", lat: 1, lng: 2 }]), /'O''Neil'/);
  // the safety promises of the generated SQL: one transaction, a backup, the sequence fix, and never a delete / truncate / id or name update
  assert.match(sql, /^-- Generated[\s\S]*\nbegin;/m); assert.match(sql, /localities_backup_before_import/); assert.match(sql, /setval\(pg_get_serial_sequence/); assert.match(sql, /raise exception 'localities import cancelled[\s\S]*commit;/);
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.ok(!/\b(delete|truncate|drop)\b/i.test(code)); assert.ok(!/set[^;]*\bname\s*=/i.test(code)); assert.ok(!/set[^;]*\bid\s*=/i.test(code));
  assert.match(sql, /commune, county\) values/);
});

test('a far-away same-name village is not used to move your row, and the new one gets its commune in the name', () => {
  const g2 = [{ name: 'Căpâlnaș', lat: 45.9667, lng: 22.2167, county: 'Arad', commune: 'Birchiș', pop: 10, code: 'PPL' }];
  const { rows, report } = build({ geo: g2, existing: [{ id: '5', slug: 'capalnas', name: 'Căpâlnaș', lat: '47.0167', lng: '22.5' }] });
  assert.equal(rows[0].lat, 47.0167); assert.equal(report.rejected.length, 1);
  assert.equal(rows[1].name, 'Căpâlnaș (Birchiș)'); assert.notEqual(rows[1].slug, 'capalnas');
});
test('GeoNames ã typo is repaired', () => { assert.equal(fixRo('Vașcãu'), 'Vașcău'); });
