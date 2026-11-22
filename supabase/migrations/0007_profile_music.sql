-- 0007: music moves from a card to the profile itself (shows in the sidebar, no ordering/visibility quirks).
create or replace function public.is_valid_music(m jsonb) returns boolean
language plpgsql immutable as $$
begin
  if m is null or jsonb_typeof(m) <> 'object' or length(m::text) > 1000 then return false; end if;
  if exists (select 1 from jsonb_object_keys(m) k where k not in ('url','title','artist','cover')) then return false; end if;
  if coalesce(m->>'url','') <> '' and ((m->>'url') !~ '^https?://[^[:space:]]+$' or length(m->>'url') > 500) then return false; end if;
  if length(coalesce(m->>'title','')) > 80 or length(coalesce(m->>'artist','')) > 80 then return false; end if;
  if m ? 'cover' and not public.is_media_path(m->>'cover') then return false; end if;
  return true;
end $$;
alter table public.profiles add column music jsonb not null default '{}'::jsonb check (public.is_valid_music(music));
grant execute on function public.is_valid_music(jsonb) to authenticated;
