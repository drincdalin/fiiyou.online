-- 0012: places can come from OpenStreetMap search (osm_ref dedupes them), looser place rate limit.
alter table public.places add column osm_ref text check (osm_ref ~ '^(node|way|relation)/[0-9]+$');
create unique index places_osm_ref_uq on public.places(osm_ref) where osm_ref is not null;
drop trigger places_rate on public.places;
create trigger places_rate before insert on public.places
  for each row execute function public.enforce_rate_limit('20', '1 hour', 'created_by');

drop function public.places_overview();
create function public.places_overview()
returns table (id uuid, name text, description text, lat double precision, lng double precision, locality_id int, created_by uuid, osm_ref text, post_count bigint, friends_there bigint)
language sql stable set search_path = public as $$
  select pl.id, pl.name, pl.description, pl.lat, pl.lng, pl.locality_id, pl.created_by, pl.osm_ref,
         (select count(*) from public.posts po where po.place_id = pl.id),
         (select count(distinct po.author_id) from public.posts po where po.place_id = pl.id and po.author_id <> auth.uid()
            and exists (select 1 from public.friendships f where f.status = 'accepted'
              and ((f.requester_id = auth.uid() and f.addressee_id = po.author_id) or (f.requester_id = po.author_id and f.addressee_id = auth.uid()))))
  from public.places pl order by pl.created_at desc
$$;
revoke all on function public.places_overview() from public, anon;
grant execute on function public.places_overview() to authenticated;
