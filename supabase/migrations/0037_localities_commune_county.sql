-- 0037: show where a village is ("Pocioveliște · Curățele · Bihor") in the locality picker, and let people search a village by its commune.
-- Both columns are optional text. Nothing else changes: ids, names and everybody's chosen locality stay as they are.
-- (scripts/build-localities.mjs fills them in; its SQL also creates the columns, so running this first is optional.)
alter table public.localities add column if not exists commune text, add column if not exists county text;
notify pgrst, 'reload schema';
