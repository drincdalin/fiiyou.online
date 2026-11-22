import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv, build } from '../../scripts/localities-csv-to-sql.mjs';

test('the localities SQL only updates by slug, never deletes, and keeps names and ids', () => {
  const rows = parseCsv(readFileSync(new URL('../../supabase/data/localities.csv', import.meta.url), 'utf8'));
  const sql = build(rows);
  assert.ok(rows.length > 1000);
  assert.match(sql, /on conflict \(slug\) do update/);
  assert.doesNotMatch(sql, /\bdelete\b|\btruncate\b|\bdrop table\b/i);
  assert.doesNotMatch(sql, /\bname = excluded\.name/);                 // a name you changed by hand stays
  assert.doesNotMatch(sql, /insert into public\.localities \(id/);     // ids always come from the database
  assert.match(sql, /\(813, 'oradea'\)/);                              // existing rows are verified by id + slug first
  assert.match(sql, /coalesce\(nullif\(excluded\.county, ''\), public\.localities\.county\)/);   // blanks never erase
});

test('CSV reader handles quotes, blank cells and CRLF; bad rows stop the build', () => {
  const r = parseCsv('id,slug,name,lat,lng,commune,county\r\n,a-b,"Ab, ""C""",46.1,22.2,,Bihor\r\n');
  assert.deepEqual(r[0], { id: '', slug: 'a-b', name: 'Ab, "C"', lat: '46.1', lng: '22.2', commune: '', county: 'Bihor' });
  assert.match(build(r), /\('a-b', 'Ab, "C"', 46\.1, 22\.2, null, 'Bihor'\)/);
  const apos = build([{ id: '', slug: 'c-d', name: "Valea lui O'Neil", lat: '46', lng: '22', commune: '', county: '' }]);
  assert.match(apos, /'Valea lui O''Neil'/);                          // an apostrophe can never break out of the SQL string
  assert.throws(() => build([{ id: '', slug: 'x', name: 'X', lat: '10', lng: '22', commune: '', county: '' }]), /outside Romania/);
  assert.throws(() => build([{ id: '', slug: 'x', name: 'X', lat: 'abc', lng: '22', commune: '', county: '' }]), /not a number/);
  const dup = { id: '', slug: 'x', name: 'X', lat: '46', lng: '22', commune: '', county: '' };
  assert.throws(() => build([dup, dup]), /duplicate slug/);
});
