-- Starter localities. Names only, from memory — verify them and fill lat/lng
-- yourself (the map skips localities with null coordinates).
insert into public.localities (slug, name) values
  ('beius',     'Beiuș'),
  ('curatele',  'Curățele'),
  ('vascau',    'Vașcău'),
  ('budureasa', 'Budureasa'),
  ('pietroasa', 'Pietroasa'),
  ('remetea',   'Remetea'),
  ('sudrigiu',  'Sudrigiu'),
  ('draganesti','Drăgănești'),
  ('dobresti',  'Dobrești'),
  ('carpinet',  'Cărpinet')
on conflict (slug) do nothing;
-- example once you have real coordinates:
-- update public.localities set lat = <lat>, lng = <lng> where slug = 'beius';
