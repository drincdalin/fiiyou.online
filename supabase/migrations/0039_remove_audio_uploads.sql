-- 0039: remove MP3 / audio uploads and hosting.
-- Why: no hosting of copyrighted tracks, and no audio egress. Profile music is now a YouTube link only.
-- What this does:
--   1. strips the 'audio' key from every profile and clears any music link that is not a YouTube address
--   2. profiles.music may no longer contain 'audio', and its url must be a YouTube address
--   3. closes the 'audio' bucket to reading and writing (no more uploads, no more playback)
--   4. keeps the DELETE policies (own + admin) so the files already stored can still be removed through the Storage API
--      (the app does this by itself: each user's orphan sweep, "Delete account", and the admin orphan scan, which now lists every old audio file).
--      SQL must NOT delete rows from storage.objects: that would orphan the files in object storage and free no space.

-- 1. data first (the check constraint is re-evaluated on every update of a row, so rows must be valid before the function changes)
update public.profiles set music = music - 'audio' where music ? 'audio';
update public.profiles set music = music - 'url'
 where coalesce(music->>'url', '') <> ''
   and (music->>'url') !~* '^https?://([a-z0-9-]+\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)(/|$)';

-- 2. validator: only url / title / artist / cover, and url must be YouTube
create or replace function public.is_valid_music(m jsonb) returns boolean
language plpgsql immutable as $$
begin
  if m is null or jsonb_typeof(m) <> 'object' or length(m::text) > 1000 then return false; end if;
  if exists (select 1 from jsonb_object_keys(m) k where k not in ('url','title','artist','cover')) then return false; end if;
  if coalesce(m->>'url','') <> '' and ((m->>'url') !~ '^https?://[^[:space:]]+$' or length(m->>'url') > 500
     or (m->>'url') !~* '^https?://([a-z0-9-]+\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)(/|$)') then return false; end if;
  if length(coalesce(m->>'title','')) > 80 or length(coalesce(m->>'artist','')) > 80 then return false; end if;
  if m ? 'cover' and not public.is_media_path(m->>'cover') then return false; end if;
  return true;
end $$;

-- 3. nobody can read, upload or replace audio any more
drop policy if exists audio_read on storage.objects;
drop policy if exists audio_insert_own on storage.objects;
drop policy if exists audio_update_own on storage.objects;
-- (audio_delete_own and audio_delete_admin stay on purpose, see 4 above)

-- the admin orphan scan no longer lists audio as "referenced": every file left in the audio bucket shows up as an orphan, ready to delete
create or replace function public.admin_referenced_paths() returns table (bucket text, path text) language plpgsql stable security definer set search_path = public as $$
begin perform public.assert_admin();
  return query
    select 'media'::text, p.avatar_path from public.profiles p where p.avatar_path is not null
    union select 'media'::text, p.theme->>'bg_image' from public.profiles p where p.theme ? 'bg_image'
    union select 'media'::text, p.music->>'cover' from public.profiles p where p.music ? 'cover'
    union select 'media'::text, i from public.profile_cards c, jsonb_array_elements_text(c.content->'images') i where jsonb_typeof(c.content->'images') = 'array'
    union select 'media'::text, ph.path from public.photos ph
    union select 'media'::text, po.image_path from public.posts po where po.image_path is not null
    union select 'media'::text, x from public.posts po, unnest(po.extra_images) x
    union select 'media'::text, sp.image_path from public.scheduled_posts sp where sp.image_path is not null
    union select 'media'::text, x from public.scheduled_posts sp, unnest(sp.extra_images) x;
end $$;
