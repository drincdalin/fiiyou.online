-- 0009: audio-only music. Private 'audio' bucket (8 MB files, 5 per user) + 'audio' key on profiles.music.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', false, 8388608, array['audio/mpeg','audio/ogg','audio/mp4','audio/x-m4a','audio/aac','audio/wav','audio/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy audio_read on storage.objects for select to authenticated using (bucket_id = 'audio');
create policy audio_insert_own on storage.objects for insert to authenticated with check (
  bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select count(*) from storage.objects o where o.bucket_id = 'audio'
        and (storage.foldername(o.name))[1] = (select auth.uid())::text) < 5);
create policy audio_update_own on storage.objects for update to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy audio_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.is_valid_music(m jsonb) returns boolean
language plpgsql immutable as $$
begin
  if m is null or jsonb_typeof(m) <> 'object' or length(m::text) > 1000 then return false; end if;
  if exists (select 1 from jsonb_object_keys(m) k where k not in ('url','title','artist','cover','audio')) then return false; end if;
  if coalesce(m->>'url','') <> '' and ((m->>'url') !~ '^https?://[^[:space:]]+$' or length(m->>'url') > 500) then return false; end if;
  if length(coalesce(m->>'title','')) > 80 or length(coalesce(m->>'artist','')) > 80 then return false; end if;
  if m ? 'cover' and not public.is_media_path(m->>'cover') then return false; end if;
  if m ? 'audio' and not public.is_media_path(m->>'audio') then return false; end if;
  return true;
end $$;
