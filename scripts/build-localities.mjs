#!/usr/bin/env node
// Builds a complete, accurate `localities` list (every village, not just the commune seats) from the GeoNames Romania dump.
//
//   1. Download (free, CC-BY):   https://download.geonames.org/export/dump/RO.zip            -> unzip -> RO.txt
//                                https://download.geonames.org/export/dump/admin1CodesASCII.txt
//                                https://download.geonames.org/export/dump/admin2Codes.txt   (optional: used to name the commune)
//   2. Export your current table from Supabase (Table Editor -> localities -> Export CSV)    -> localities_rows.csv
//   3. node scripts/build-localities.mjs --geonames RO.txt --admin1 admin1CodesASCII.txt --admin2 admin2Codes.txt \
//          --existing localities_rows.csv --counties Bihor,Alba,Arad --out localities
//
// Writes:
//   localities.csv      id,slug,name,lat,lng,commune,county    (existing rows keep their id + slug + name; only lat/lng are corrected. New villages have no id yet)
//   localities.sql      insert ... on conflict (slug) do update   <- run this in the Supabase SQL editor. It keeps every id, so profiles/posts that
//                       point at a locality are never touched; new villages get new ids from the database.
//   localities.report.txt  what changed, what moved a lot (check these by eye) and which of your rows GeoNames did not find.
//
// Options: --max-move-km 25 (a match farther than this is refused) | --counties A,B,C (names as in admin1CodesASCII; default Bihor,Alba,Arad) | --all (whole of Romania, ~13 000 rows: a <select> that long is not nice to use)
//          --include-sections (also neighbourhoods of cities, feature code PPLX) | --min-move-km 1.5 (report threshold)
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const need = (k) => { const v = opt(k); if (!v || v === true) { console.error(`missing --${k}`); process.exit(1); } return v; };

// ---- helpers (exported for the test) ----
// GeoNames writes ş ţ with a cedilla (old Turkish-style); Romanian uses comma-below ș ț. Existing rows and the rest of the app use comma-below.
export const fixRo = (s) => s.replace(/ã/g, 'ă').replace(/Ã/g, 'Ă').replace(/ş/g, 'ș').replace(/Ş/g, 'Ș').replace(/ţ/g, 'ț').replace(/Ţ/g, 'Ț');
export const ascii = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[șş]/gi, 's').replace(/[țţ]/gi, 't');
export const slugify = (s) => ascii(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const km = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, dLat = (c - a) * r, dLng = (d - b) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const stripKind = (n) => fixRo(n).replace(/^(Comuna|Municipiul|Municipiu|Orașul|Oraşul|Oraș|Oraş)\s+/i, '').trim();
export const parseCsv = (txt) => { const [h, ...rows] = txt.replace(/\r/g, '').trim().split('\n'); const cols = h.split(',');
  return rows.map((r) => { const v = r.split(','); return Object.fromEntries(cols.map((c, i) => [c, v[i]])); }); };

// "Bihor", "Bihor County", "Județul Bihor", "Judetul Bihor" all count as Bihor
const bare = (c) => ascii(c).toLowerCase().replace(/\b(county|judetul|judet|jud)\b/g, '').replace(/[^a-z]+/g, ' ').trim();
const countyWanted = (county, wanted) => { const b = bare(county); return [...wanted].some((w) => bare(w) === b); };

export function parseGeonames(txt, { admin1, admin2, counties, sections }) {
  const keep = new Set(['PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLC', 'PPLL', 'PPLS', ...(sections ? ['PPLX'] : [])]);   // not PPLH/PPLW/PPLQ (historical, destroyed, abandoned)
  const out = [];
  for (const line of txt.split('\n')) {
    const f = line.split('\t'); if (f.length < 15 || f[6] !== 'P' || !keep.has(f[7])) continue;
    const county = admin1.get(f[10]) || f[10]; if (counties && !countyWanted(county, counties)) continue;
    const lat = Number(f[4]), lng = Number(f[5]); if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ name: fixRo(f[1]), lat, lng, county, commune: stripKind(admin2.get(`RO.${f[10]}.${f[11]}`) || ''), pop: Number(f[14]) || 0, code: f[7] });
  }
  return out;
}

export function build({ geo, existing, minMoveKm = 1.5, maxMoveKm = 25 }) {
  const bySlug = new Map(); for (const g of geo) { const k = slugify(g.name); (bySlug.get(k) || bySlug.set(k, []).get(k)).push(g); }
  const used = new Set(); const rows = []; const report = { moved: [], same: 0, notFound: [], ambiguous: [], rejected: [] };

  // 1) your rows: keep id / slug / name, correct the coordinates
  for (const e of existing) {
    const lat = Number(e.lat), lng = Number(e.lng); const cands = (bySlug.get(slugify(e.name)) || []).filter((c) => !used.has(c));
    if (!cands.length) { report.notFound.push(e); rows.push({ ...e, lat, lng }); continue; }
    // several villages share a name: take the one closest to where you had it (the biggest one if you had no coordinates)
    cands.sort((a, b) => Number.isFinite(lat) ? km(lat, lng, a.lat, a.lng) - km(lat, lng, b.lat, b.lng) : b.pop - a.pop);
    const g = cands[0];
    // the closest place with this name is far away: most likely a different village that shares the name. Do not move your row onto it.
    if (Number.isFinite(lat) && km(lat, lng, g.lat, g.lng) > maxMoveKm) { report.rejected.push({ e, g, d: km(lat, lng, g.lat, g.lng) }); rows.push({ ...e, lat, lng }); continue; }
    if (cands.length > 1) report.ambiguous.push(`${e.name}: ${cands.length} places with this name, took ${g.commune || g.county} (${g.lat.toFixed(4)}, ${g.lng.toFixed(4)})`);
    used.add(g); const d = Number.isFinite(lat) ? km(lat, lng, g.lat, g.lng) : Infinity;
    if (d > minMoveKm) report.moved.push({ e, g, d }); else report.same++;
    rows.push({ ...e, lat: +g.lat.toFixed(5), lng: +g.lng.toFixed(5), commune: g.commune, county: g.county });
  }

  // 2) villages you did not have yet. A name used twice gets the commune added: "Săliște (Budureasa)"
  const have = new Set(rows.map((r) => slugify(r.name)));
  const fresh = geo.filter((g) => !used.has(g)).sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  const taken = new Set(rows.map((r) => r.slug)); const nameCount = new Map(); for (const g of [...geo]) nameCount.set(slugify(g.name), (nameCount.get(slugify(g.name)) || 0) + 1);
  for (const g of fresh) {
    const dup = (nameCount.get(slugify(g.name)) > 1 || have.has(slugify(g.name))) && g.commune && slugify(g.commune) !== slugify(g.name);
    const name = dup ? `${g.name} (${g.commune})` : g.name; let slug = slugify(name) || 'loc'; let n = 2; const base = slug;
    while (taken.has(slug)) slug = `${base}-${n++}`;
    taken.add(slug); rows.push({ id: '', slug, name, lat: +g.lat.toFixed(5), lng: +g.lng.toFixed(5), commune: g.commune, county: g.county });
  }
  return { rows, report, added: fresh.length };
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const csvCell = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
const nul = (v) => (v == null || v === '' ? 'null' : q(v));
const clean = (c) => (c ? String(c).replace(/ County$/i, '') : '');
export const toCsv = (rows) => 'id,slug,name,lat,lng,commune,county\n' + rows.map((r) => [r.id, r.slug, r.name, r.lat, r.lng, r.commune || '', clean(r.county)].map(csvCell).join(',')).join('\n') + '\n';
export const toSql = (rows) => `-- Generated by scripts/build-localities.mjs.
-- SAFE for existing people: it never deletes or renumbers a row and never changes a name. Everyone keeps the locality they picked
-- (profiles.locality_id / posts.locality_id point at the id, and the ids stay). Existing places only get better coordinates + their commune/county.
-- Do NOT instead delete the table or re-import with "replace": the foreign keys are "on delete set null", that would clear everybody's locality.
begin;

-- 1) a copy of the table as it is now (nobody can read it through the API: RLS on, no policy)
create table if not exists public.localities_backup_before_import as select * from public.localities;
alter table public.localities_backup_before_import enable row level security;

-- 2) the two columns the locality picker shows next to a village ("Curățele · Bihor"); same as migration 0037, harmless to run twice
alter table public.localities add column if not exists commune text, add column if not exists county text;

-- 3) make sure new rows get ids above the existing ones (the table was filled with explicit ids before)
select setval(pg_get_serial_sequence('public.localities', 'id'), greatest((select coalesce(max(id), 1) from public.localities), 1));

-- 4) existing places (matched on slug): new coordinates. New villages: inserted, the database gives them an id.
insert into public.localities (slug, name, lat, lng, commune, county) values
` + rows.map((r) => `  (${q(r.slug)}, ${q(r.name)}, ${r.lat}, ${r.lng}, ${nul(r.commune)}, ${nul(clean(r.county))})`).join(',\n') + `
on conflict (slug) do update set lat = excluded.lat, lng = excluded.lng,
  commune = coalesce(excluded.commune, public.localities.commune), county = coalesce(excluded.county, public.localities.county);   -- names are left as they are

-- 5) safety net: if any existing row lost its id / name / slug, or the table got smaller, everything above is rolled back and nothing is changed
do $$
declare bad int; before_n int; now_n int;
begin
  select count(*) into bad from public.localities_backup_before_import b
    where not exists (select 1 from public.localities l where l.id = b.id and l.name = b.name and l.slug = b.slug);
  select count(*) into before_n from public.localities_backup_before_import; select count(*) into now_n from public.localities;
  if bad > 0 or now_n < before_n then raise exception 'localities import cancelled: % existing rows changed or missing', bad; end if;
end $$;
commit;

select (select count(*) from public.localities) as places_now, (select count(*) from public.localities_backup_before_import) as places_before;
`;

// ---- run ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const admin1 = new Map(); for (const l of readFileSync(need('admin1'), 'utf8').split('\n')) { const f = l.split('\t'); if (f[0]?.startsWith('RO.')) admin1.set(f[0].slice(3), f[2] || f[1]); }
  const admin2 = new Map(); if (opt('admin2')) for (const l of readFileSync(opt('admin2'), 'utf8').split('\n')) { const f = l.split('\t'); if (f[0]?.startsWith('RO.')) admin2.set(f[0], f[1]); }
  const counties = opt('all') ? null : new Set(String(opt('counties', 'Bihor,Alba,Arad')).split(',').map((s) => s.trim()));
  const geo = parseGeonames(readFileSync(need('geonames'), 'utf8'), { admin1, admin2, counties, sections: !!opt('include-sections') });
  if (!geo.length) {
    console.error('No places matched.'); console.error('County names found in admin1CodesASCII.txt: ' + [...admin1.values()].join(', '));
    console.error('You asked for: ' + [...(counties || [])].join(', ')); console.error('Use the spelling from the first list in --counties.'); process.exit(1);
  }
  const existing = parseCsv(readFileSync(need('existing'), 'utf8'));
  const { rows, report, added } = build({ geo, existing, minMoveKm: Number(opt('min-move-km', 1.5)), maxMoveKm: Number(opt('max-move-km', 25)) });
  const base = opt('out', 'localities');
  writeFileSync(`${base}.csv`, toCsv(rows)); writeFileSync(`${base}.sql`, toSql(rows));
  const L = [`GeoNames places read: ${geo.length}`, `your rows: ${existing.length} | coordinates already right (<= ${opt('min-move-km', 1.5)} km): ${report.same} | corrected: ${report.moved.length} | not moved (too far): ${report.rejected.length} | not found: ${report.notFound.length}`, `new villages added: ${added}`, '',
    '== corrected, biggest move first (look at the top ones) ==', ...report.moved.sort((a, b) => b.d - a.d).map(({ e, g, d }) => `${e.name}: ${e.lat},${e.lng} -> ${g.lat.toFixed(4)},${g.lng.toFixed(4)}  (${Number.isFinite(d) ? d.toFixed(1) + ' km' : 'no coordinates before'}; ${g.commune || '-'}, ${g.county})`),
    '', `== NOT moved: the only match was more than ${opt('max-move-km', 25)} km away (probably another village with the same name; kept as you have it) ==`, ...report.rejected.map(({ e, g, d }) => `${e.name}: kept ${e.lat},${e.lng}; GeoNames only has ${g.lat.toFixed(4)},${g.lng.toFixed(4)} (${g.commune || '-'}, ${g.county}), ${d.toFixed(0)} km away`),
    '', '== your rows GeoNames did not find in these counties (kept as they are; check by hand) ==', ...report.notFound.map((e) => `${e.name} (${e.slug}) ${e.lat},${e.lng}`),
    '', '== same name used by several places (the closest one was taken) ==', ...report.ambiguous];
  writeFileSync(`${base}.report.txt`, L.join('\n') + '\n');
  console.log(L.slice(0, 3).join('\n')); console.log(`wrote ${base}.csv, ${base}.sql, ${base}.report.txt`);
}
