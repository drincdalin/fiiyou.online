-- 0010_custom_fonts.sql
-- Custom profile fonts: a private 'fonts' bucket + one new theme key (theme.font_file) + theme values 'custom'.
-- Run in the Supabase SQL editor (or as a migration). Safe to re-run.

-- 1) Bucket. 300 KB is the real enforcement; the client check only gives a nicer error message.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fonts', 'fonts', false, 307200, array['font/woff2', 'font/woff', 'font/otf', 'font/ttf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 2) Storage policies. Anyone signed in can read (visitors need it to render someone's profile);
--    only the owner can write or delete inside their own folder (<uid>/<file>).
--    If your 'media' / 'audio' buckets use different rules (for example read limited to friends), copy THEIR select policy here.
drop policy if exists fonts_select on storage.objects;
create policy fonts_select on storage.objects for select to authenticated
  using (bucket_id = 'fonts');

drop policy if exists fonts_insert on storage.objects;
create policy fonts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fonts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists fonts_delete on storage.objects;
create policy fonts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fonts' and (storage.foldername(name))[1] = auth.uid()::text);

-- 3) Theme validation.
--    I could not see is_valid_theme() (migration 0006), so it is not rewritten here. Make these two changes inside it:
--
--    a) allow 'custom' wherever it checks the font lists. Example:
--         font      in ('default','ubuntu','sans','serif','mono','pixel','verdana','comic','custom')
--         name_font in ('default','ubuntu','sans','serif','mono','pixel','verdana','comic','custom')
--
--    b) allow the new key `font_file` and validate it with the helper below. Example, next to the bg_image check:
--         and (t->>'font_file' is null or public.is_valid_font_path(t->>'font_file'))
--
--    If is_valid_theme() rejects unknown keys, add 'font_file' to its allowed-key list too.

create or replace function public.is_valid_font_path(p text)
returns boolean language sql immutable as $$
  select p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(woff2|woff|otf|ttf)$'
$$;

-- Optional, stricter: also require the path to start with the profile owner's id. Inside a BEFORE INSERT/UPDATE trigger
-- on profiles you could add:
--   if new.theme ? 'font_file' and split_part(new.theme->>'font_file', '/', 1) <> new.id::text then
--     raise exception 'invalid font_file';
--   end if;
