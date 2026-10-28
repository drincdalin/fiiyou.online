-- 0011: places, post edit/likes, events (title + official accounts), photos (captions, likes, order),
-- profile views, direct messages. Run after 0001-0009.

-- ---- official accounts: only the dashboard/service role can set is_official ----
alter table public.profiles add column is_official boolean not null default false;
revoke update on public.profiles from authenticated;
grant update (display_name, headline, bio, locality_id, avatar_path, show_on_map, wall_policy, theme, music)
  on public.profiles to authenticated;

-- ---- places ----
create table public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 300),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  locality_id int references public.localities(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create trigger places_rate before insert on public.places
  for each row execute function public.enforce_rate_limit('5', '1 hour', 'created_by');

-- ---- posts: title (events), place, edited marker ----
alter table public.posts
  add column title text check (char_length(title) <= 100),
  add column place_id uuid references public.places(id) on delete set null,
  add column edited_at timestamptz;
create index posts_place_idx on public.posts(place_id, created_at desc);
create function public.mark_post_edited() returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body or new.title is distinct from old.title then new.edited_at := now(); end if;
  return new;
end $$;
create trigger posts_edited before update on public.posts for each row execute function public.mark_post_edited();

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (post_id, user_id)
);

-- ---- photos (gallery) ----
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  path text not null check (public.is_media_path(path)),
  caption text check (char_length(caption) <= 300),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index photos_owner_idx on public.photos(owner_id, position);
create table public.photo_likes (
  photo_id uuid not null references public.photos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (photo_id, user_id)
);
create function public.limit_photos() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.photos where owner_id = new.owner_id) >= 60 then raise exception 'photo_limit' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger photos_limit before insert on public.photos for each row execute function public.limit_photos();
-- carry over images from old gallery cards
insert into public.photos (owner_id, path, position)
select c.profile_id, t.img, t.ord::int
from public.profile_cards c, jsonb_array_elements_text(c.content->'images') with ordinality as t(img, ord)
where c.type = 'gallery' and jsonb_typeof(c.content->'images') = 'array' and public.is_media_path(t.img);

-- ---- profile views (who is never exposed; one count per viewer per day) ----
create table public.profile_views (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  day date not null default current_date,
  primary key (profile_id, viewer_id, day)
);

-- ---- direct messages (friends only) ----
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);
create index messages_recipient_idx on public.messages(recipient_id, sender_id, created_at desc);
create index messages_sender_idx on public.messages(sender_id, created_at desc);
create trigger messages_rate before insert on public.messages
  for each row execute function public.enforce_rate_limit('60', '1 minute', 'sender_id');
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
exception when duplicate_object then null; end $$;

-- ---- RLS ----
alter table public.places enable row level security;       alter table public.post_likes enable row level security;
alter table public.photos enable row level security;       alter table public.photo_likes enable row level security;
alter table public.profile_views enable row level security; alter table public.messages enable row level security;

create policy places_read on public.places for select to authenticated using (true);
create policy places_insert on public.places for insert to authenticated with check (created_by = (select auth.uid()));
create policy places_update on public.places for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy places_delete on public.places for delete to authenticated using (created_by = (select auth.uid()));

create policy post_likes_read on public.post_likes for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id));
create policy post_likes_insert on public.post_likes for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.posts p where p.id = post_id));
create policy post_likes_delete on public.post_likes for delete to authenticated using (user_id = (select auth.uid()));

create policy photos_read on public.photos for select to authenticated using (not public.is_blocked_between((select auth.uid()), owner_id));
create policy photos_insert on public.photos for insert to authenticated with check (owner_id = (select auth.uid()));
create policy photos_update on public.photos for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy photos_delete on public.photos for delete to authenticated using (owner_id = (select auth.uid()));
create policy photo_likes_read on public.photo_likes for select to authenticated using (exists (select 1 from public.photos p where p.id = photo_id));
create policy photo_likes_insert on public.photo_likes for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.photos p where p.id = photo_id));
create policy photo_likes_delete on public.photo_likes for delete to authenticated using (user_id = (select auth.uid()));

-- profile_views: no policies on purpose (nobody can read who viewed)
create policy messages_read on public.messages for select to authenticated using ((select auth.uid()) in (sender_id, recipient_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.are_friends((select auth.uid()), recipient_id));

-- ---- functions ----
drop function if exists public.local_feed(int, boolean, timestamptz, int, text);
create function public.local_feed(
  p_locality int default null, p_only_friends boolean default false, p_before timestamptz default null, p_limit int default 20,
  p_kind text default null, p_place uuid default null, p_upcoming boolean default false, p_no_events boolean default false)
returns table (id uuid, author_id uuid, locality_id int, kind text, title text, body text, image_path text, event_at timestamptz,
  event_place text, place_id uuid, place_name text, visibility text, created_at timestamptz, edited_at timestamptz,
  author_username text, author_display_name text, author_avatar_path text, author_official boolean, author_is_friend boolean,
  comment_count bigint, like_count bigint, liked boolean)
language sql stable set search_path = public as $$
  select po.id, po.author_id, po.locality_id, po.kind, po.title, po.body, po.image_path, po.event_at, po.event_place, po.place_id, pl.name,
         po.visibility, po.created_at, po.edited_at, pr.username, pr.display_name, pr.avatar_path, pr.is_official,
         exists (select 1 from public.friendships f where f.status = 'accepted' and ((f.requester_id = auth.uid() and f.addressee_id = po.author_id) or (f.requester_id = po.author_id and f.addressee_id = auth.uid()))),
         (select count(*) from public.post_comments c where c.post_id = po.id),
         (select count(*) from public.post_likes l where l.post_id = po.id),
         exists (select 1 from public.post_likes l where l.post_id = po.id and l.user_id = auth.uid())
  from public.posts po
  join public.profiles pr on pr.id = po.author_id
  left join public.places pl on pl.id = po.place_id
  where (p_locality is null or po.locality_id = p_locality)
    and (p_before is null or po.created_at < p_before)
    and (p_kind is null or po.kind = p_kind)
    and (p_place is null or po.place_id = p_place)
    and (not p_upcoming or po.event_at >= now() - interval '3 hours')
    and (not p_no_events or po.kind <> 'event')
    and (not p_only_friends or po.author_id = auth.uid() or exists (
          select 1 from public.friendships f where f.status = 'accepted'
            and ((f.requester_id = auth.uid() and f.addressee_id = po.author_id) or (f.requester_id = po.author_id and f.addressee_id = auth.uid()))))
  order by case when p_upcoming then po.event_at end asc nulls last, po.created_at desc
  limit least(greatest(p_limit, 1), 50)
$$;

create function public.photos_of(p_profile uuid)
returns table (id uuid, path text, caption text, "position" int, like_count bigint, liked boolean)
language sql stable set search_path = public as $$
  select ph.id, ph.path, ph.caption, ph.position,
         (select count(*) from public.photo_likes l where l.photo_id = ph.id),
         exists (select 1 from public.photo_likes l where l.photo_id = ph.id and l.user_id = auth.uid())
  from public.photos ph where ph.owner_id = p_profile order by ph.position, ph.created_at
$$;

create function public.reorder_photos(p_ids uuid[]) returns void language sql set search_path = public as $$
  update public.photos ph set position = t.rnk::int
  from unnest(p_ids) with ordinality as t(pid, rnk) where ph.id = t.pid and ph.owner_id = auth.uid()
$$;

create function public.places_overview()
returns table (id uuid, name text, description text, lat double precision, lng double precision, locality_id int, created_by uuid, post_count bigint, friends_there bigint)
language sql stable set search_path = public as $$
  select pl.id, pl.name, pl.description, pl.lat, pl.lng, pl.locality_id, pl.created_by,
         (select count(*) from public.posts po where po.place_id = pl.id),
         (select count(distinct po.author_id) from public.posts po where po.place_id = pl.id and po.author_id <> auth.uid()
            and exists (select 1 from public.friendships f where f.status = 'accepted'
              and ((f.requester_id = auth.uid() and f.addressee_id = po.author_id) or (f.requester_id = po.author_id and f.addressee_id = auth.uid()))))
  from public.places pl order by pl.created_at desc
$$;

create function public.conversations()
returns table (id uuid, username text, display_name text, avatar_path text, last_body text, last_at timestamptz, last_mine boolean, unread bigint)
language sql stable set search_path = public as $$
  with mine as (select m.*, case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end as peer
                from public.messages m where auth.uid() in (m.sender_id, m.recipient_id)),
       lastm as (select distinct on (peer) * from mine order by peer, created_at desc)
  select p.id, p.username, p.display_name, p.avatar_path, l.body, l.created_at, (l.sender_id = auth.uid()),
         (select count(*) from public.messages x where x.sender_id = p.id and x.recipient_id = auth.uid() and x.read_at is null)
  from lastm l join public.profiles p on p.id = l.peer order by l.created_at desc
$$;

create function public.mark_read(p_peer uuid) returns void language sql security definer set search_path = public as $$
  update public.messages set read_at = now() where recipient_id = auth.uid() and sender_id = p_peer and read_at is null
$$;
create function public.unread_count() returns bigint language sql stable set search_path = public as $$
  select count(*) from public.messages where recipient_id = auth.uid() and read_at is null
$$;

create function public.record_profile_view(p_profile uuid) returns void language sql security definer set search_path = public as $$
  insert into public.profile_views (profile_id, viewer_id)
  select p_profile, auth.uid()
  where auth.uid() is not null and auth.uid() <> p_profile and not public.is_blocked_between(auth.uid(), p_profile)
  on conflict do nothing
$$;
create function public.profile_view_count(p_profile uuid) returns bigint language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then 0 else (select count(*) from public.profile_views where profile_id = p_profile) end
$$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
grant execute on function public.username_available(text) to anon;
