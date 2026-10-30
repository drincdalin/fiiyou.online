-- 0029: global search, scheduled posts, several images per post, pinned messages, message search.
-- Run once in the SQL editor after 0028. Re-running is safe.
-- Needs the same unaccent extension as 0024.

create extension if not exists unaccent with schema extensions;

-- ============================================================ 1. search
-- lower-cased, unaccented, LIKE-escaped pattern text ("Ștefan" -> "stefan", "100%" -> "100\%")
create or replace function public._like_text(p text) returns text language sql stable as $$
  select replace(replace(replace(extensions.unaccent(lower(trim(coalesce(p, '')))), '\', '\\'), '%', '\%'), '_', '\_')
$$;

-- Ids of PUBLIC posts whose title or text contains the query, newest first. Like tag_post_ids(): the app loads each one
-- through get_post(), which applies the normal visibility and block rules. Friends-only posts are never listed.
create or replace function public.search_post_ids(p_query text, p_before timestamptz default null, p_limit int default 20)
returns table (id uuid, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.created_at
  from public.posts p
  where auth.uid() is not null
    and char_length(trim(coalesce(p_query, ''))) >= 2
    and p.visibility = 'public'
    and (p_before is null or p.created_at < p_before)
    and extensions.unaccent(lower(coalesce(p.title, '') || ' ' || p.body)) like '%' || public._like_text(p_query) || '%'
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke all on function public.search_post_ids(text, timestamptz, int) from public, anon;
grant execute on function public.search_post_ids(text, timestamptz, int) to authenticated;

-- Hashtags that start with the query (without the #), most used first.
create or replace function public.search_tags(p_query text, p_limit int default 8)
returns table (tag text, uses bigint)
language sql stable security definer set search_path = public as $$
  select t.tag, count(*) as uses
  from public.post_tags t
  join public.posts p on p.id = t.post_id
  where auth.uid() is not null
    and p.visibility = 'public'
    and char_length(trim(coalesce(p_query, ''))) >= 1
    and extensions.unaccent(t.tag) like public._like_text(ltrim(trim(p_query), '#')) || '%'
  group by t.tag
  order by count(*) desc, t.tag
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;
revoke all on function public.search_tags(text, int) from public, anon;
grant execute on function public.search_tags(text, int) to authenticated;

-- ============================================================ 2. several images per post
-- image_path stays the first image (so every old post and function keeps working); the others live in extra_images.
alter table public.posts add column if not exists extra_images text[] not null default '{}';
alter table public.posts drop constraint if exists posts_extra_images_check;
alter table public.posts add constraint posts_extra_images_check check (
  cardinality(extra_images) <= 3 and (cardinality(extra_images) = 0 or image_path is not null));
create or replace function public.valid_extra_images(p text[]) returns boolean language sql immutable as $$
  select coalesce(bool_and(public.is_media_path(x)), true) from unnest(p) x
$$;
alter table public.posts drop constraint if exists posts_extra_images_paths;
alter table public.posts add constraint posts_extra_images_paths check (public.valid_extra_images(extra_images));
create index if not exists posts_extra_images_idx on public.posts using gin (extra_images);

-- a friends-only post hides ALL of its images from non-friends, not only the first
create or replace function public.can_read_media(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; folder text := split_part(p_name, '/', 1);
begin
  if me is null then return false; end if;
  if folder !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return false; end if;
  owner := folder::uuid;
  if owner = me or public.is_admin() then return true; end if;
  if exists (select 1 from public.blocks b
              where (b.blocker_id = me and b.blocked_id = owner) or (b.blocker_id = owner and b.blocked_id = me)) then return false; end if;
  if exists (select 1 from public.posts po
              where (po.image_path = p_name or p_name = any (po.extra_images)) and po.visibility = 'friends' and po.author_id <> me
                and not public.are_friends(me, po.author_id)) then return false; end if;
  return true;
end $$;
revoke all on function public.can_read_media(text) from public, anon;
grant execute on function public.can_read_media(text) to authenticated;

-- feed and single post now also return extra_images (return type changes, so drop and create)
drop function if exists public.get_post(uuid);
create function public.get_post(p_id uuid)
returns table (id uuid, author_id uuid, locality_id int, kind text, title text, body text, image_path text, extra_images text[], event_at timestamptz,
  event_place text, place_id uuid, place_name text, visibility text, created_at timestamptz, edited_at timestamptz,
  author_username text, author_display_name text, author_avatar_path text, author_official boolean, author_is_friend boolean,
  comment_count bigint, like_count bigint, liked boolean)
language sql stable set search_path = public as $$
  select po.id, po.author_id, po.locality_id, po.kind, po.title, po.body, po.image_path, po.extra_images, po.event_at, po.event_place, po.place_id, pl.name,
         po.visibility, po.created_at, po.edited_at, pr.username, pr.display_name, pr.avatar_path, pr.is_official,
         exists (select 1 from public.friendships f where f.status = 'accepted' and ((f.requester_id = auth.uid() and f.addressee_id = po.author_id) or (f.requester_id = po.author_id and f.addressee_id = auth.uid()))),
         (select count(*) from public.post_comments c where c.post_id = po.id),
         (select count(*) from public.post_likes l where l.post_id = po.id),
         exists (select 1 from public.post_likes l where l.post_id = po.id and l.user_id = auth.uid())
  from public.posts po
  join public.profiles pr on pr.id = po.author_id
  left join public.places pl on pl.id = po.place_id
  where po.id = p_id
$$;
revoke all on function public.get_post(uuid) from public, anon;
grant execute on function public.get_post(uuid) to authenticated;

drop function if exists public.local_feed(int, boolean, timestamptz, int, text, uuid, boolean, boolean);
create function public.local_feed(
  p_locality int default null, p_only_friends boolean default false, p_before timestamptz default null, p_limit int default 20,
  p_kind text default null, p_place uuid default null, p_upcoming boolean default false, p_no_events boolean default false)
returns table (id uuid, author_id uuid, locality_id int, kind text, title text, body text, image_path text, extra_images text[], event_at timestamptz,
  event_place text, place_id uuid, place_name text, visibility text, created_at timestamptz, edited_at timestamptz,
  author_username text, author_display_name text, author_avatar_path text, author_official boolean, author_is_friend boolean,
  comment_count bigint, like_count bigint, liked boolean)
language sql stable set search_path = public as $$
  select po.id, po.author_id, po.locality_id, po.kind, po.title, po.body, po.image_path, po.extra_images, po.event_at, po.event_place, po.place_id, pl.name,
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
revoke all on function public.local_feed(int, boolean, timestamptz, int, text, uuid, boolean, boolean) from public, anon;
grant execute on function public.local_feed(int, boolean, timestamptz, int, text, uuid, boolean, boolean) to authenticated;

-- ============================================================ 3. scheduled posts
-- A scheduled post waits in its own table (nobody else can see it, not even by id) and is moved into public.posts when its time comes.
-- publish_due_posts() does the move. The app calls it when it opens and every minute; if pg_cron is available it is also scheduled below.
create table if not exists public.scheduled_posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles(id) on delete cascade,
  publish_at  timestamptz not null,
  kind        text not null default 'status' check (kind in ('status','event','ask')),
  title       text,
  body        text not null check (char_length(body) between 1 and 1000),
  image_path  text check (image_path is null or public.is_media_path(image_path)),
  extra_images text[] not null default '{}' check (cardinality(extra_images) <= 3 and public.valid_extra_images(extra_images)),
  locality_id int references public.localities(id) on delete set null,
  place_id    uuid references public.places(id) on delete set null,
  visibility  text not null default 'public' check (visibility in ('public','friends')),
  event_at    timestamptz,
  event_place text check (char_length(event_place) <= 120),
  created_at  timestamptz not null default now(),
  check (kind <> 'event' or event_at is not null),
  check (publish_at <= now() + interval '1 year')
);
create index if not exists scheduled_posts_due_idx on public.scheduled_posts (publish_at);
create index if not exists scheduled_posts_author_idx on public.scheduled_posts (author_id, publish_at);
alter table public.scheduled_posts enable row level security;
drop policy if exists scheduled_select on public.scheduled_posts;
drop policy if exists scheduled_insert on public.scheduled_posts;
drop policy if exists scheduled_delete on public.scheduled_posts;
create policy scheduled_select on public.scheduled_posts for select to authenticated using (author_id = (select auth.uid()));
create policy scheduled_insert on public.scheduled_posts for insert to authenticated
  with check (author_id = (select auth.uid()) and publish_at > now() - interval '1 minute');
create policy scheduled_delete on public.scheduled_posts for delete to authenticated using (author_id = (select auth.uid()));
revoke all on public.scheduled_posts from anon;
revoke update on public.scheduled_posts from authenticated;   -- to change one: delete it and schedule a new one

-- at most 20 waiting posts per person
create or replace function public.limit_scheduled_posts() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.scheduled_posts where author_id = new.author_id) >= 20 then raise exception 'too_many_scheduled'; end if;
  return new;
end $$;
drop trigger if exists scheduled_posts_limit on public.scheduled_posts;
create trigger scheduled_posts_limit before insert on public.scheduled_posts for each row execute function public.limit_scheduled_posts();

-- Publishes every post that is due. One row at a time, so a post that is blocked (for example by the posts-per-hour limit)
-- simply stays scheduled and is tried again next minute. Returns how many were published.
create or replace function public.publish_due_posts() returns int language plpgsql security definer set search_path = public as $$
declare r public.scheduled_posts; n int := 0;
begin
  for r in select * from public.scheduled_posts where publish_at <= now() order by publish_at limit 50 for update skip locked loop
    begin
      insert into public.posts (author_id, kind, title, body, image_path, extra_images, locality_id, place_id, visibility, event_at, event_place)
        values (r.author_id, r.kind, r.title, r.body, r.image_path, r.extra_images, r.locality_id, r.place_id, r.visibility, r.event_at, r.event_place);
      delete from public.scheduled_posts where id = r.id;
      n := n + 1;
    exception when others then
      raise notice 'scheduled post % not published yet: %', r.id, sqlerrm;
    end;
  end loop;
  return n;
end $$;
revoke all on function public.publish_due_posts() from public, anon;
grant execute on function public.publish_due_posts() to authenticated;

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('publish-due-posts', '* * * * *', 'select public.publish_due_posts()');
  end if;
exception when others then raise notice 'pg_cron not enabled (%). The app publishes due posts itself when it is open.', sqlerrm;
end $$;

-- the admin orphan scan must know about the new image columns, or it would offer live files for deletion
create or replace function public.admin_referenced_paths() returns table (bucket text, path text) language plpgsql stable security definer set search_path = public as $$
begin perform public.assert_admin();
  return query
    select 'media'::text, p.avatar_path from public.profiles p where p.avatar_path is not null
    union select 'media'::text, p.theme->>'bg_image' from public.profiles p where p.theme ? 'bg_image'
    union select 'media'::text, p.music->>'cover' from public.profiles p where p.music ? 'cover'
    union select 'audio'::text, p.music->>'audio' from public.profiles p where p.music ? 'audio'
    union select 'media'::text, i from public.profile_cards c, jsonb_array_elements_text(c.content->'images') i where jsonb_typeof(c.content->'images') = 'array'
    union select 'media'::text, ph.path from public.photos ph
    union select 'media'::text, po.image_path from public.posts po where po.image_path is not null
    union select 'media'::text, x from public.posts po, unnest(po.extra_images) x
    union select 'media'::text, sp.image_path from public.scheduled_posts sp where sp.image_path is not null
    union select 'media'::text, x from public.scheduled_posts sp, unnest(sp.extra_images) x;
end $$;

-- ============================================================ 4. pinned messages + message search
create table if not exists public.message_pins (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  peer_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index if not exists message_pins_peer_idx on public.message_pins (user_id, peer_id, created_at desc);
alter table public.message_pins enable row level security;
drop policy if exists pins_select on public.message_pins;
drop policy if exists pins_insert on public.message_pins;
drop policy if exists pins_delete on public.message_pins;
create policy pins_select on public.message_pins for select to authenticated using (user_id = (select auth.uid()));
create policy pins_delete on public.message_pins for delete to authenticated using (user_id = (select auth.uid()));
-- pins are private to the person who pinned; the message must belong to a conversation they are in, with that peer
create policy pins_insert on public.message_pins for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.messages m where m.id = message_id
              and ((m.sender_id = user_id and m.recipient_id = peer_id) or (m.recipient_id = user_id and m.sender_id = peer_id))));
revoke all on public.message_pins from anon;
revoke update on public.message_pins from authenticated;

create or replace function public.limit_message_pins() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.message_pins where user_id = new.user_id and peer_id = new.peer_id) >= 5 then raise exception 'too_many_pins'; end if;
  return new;
end $$;
drop trigger if exists message_pins_limit on public.message_pins;
create trigger message_pins_limit before insert on public.message_pins for each row execute function public.limit_message_pins();

-- Search inside my own conversations (all of them, or one with p_peer). Runs as the caller, so messages RLS decides what is visible.
-- Deleted messages and shared-post cards are not searched.
create or replace function public.search_messages(p_query text, p_peer uuid default null, p_limit int default 30)
returns table (id uuid, peer_id uuid, sender_id uuid, body text, created_at timestamptz)
language sql stable set search_path = public as $$
  select m.id, case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end, m.sender_id, m.body, m.created_at
  from public.messages m
  where char_length(trim(coalesce(p_query, ''))) >= 2
    and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
    and (p_peer is null or m.sender_id = p_peer or m.recipient_id = p_peer)
    and m.body <> '[message deleted]' and m.body not like 'fiiyou:post:%'
    and extensions.unaccent(lower(m.body)) like '%' || public._like_text(p_query) || '%'
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;
revoke all on function public.search_messages(text, uuid, int) from public, anon;
grant execute on function public.search_messages(text, uuid, int) to authenticated;

-- ============================================================ 5. "typing…" indicator (Realtime broadcast, private channel)
-- Topic: typing:<smaller user id>:<larger user id>. Only those two people may send to or listen on it.
-- Skipped silently where the Realtime schema does not exist (plain Postgres). If it fails the app just shows no indicator.
do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists typing_receive on realtime.messages';
    execute 'drop policy if exists typing_send on realtime.messages';
    execute $p$create policy typing_receive on realtime.messages for select to authenticated using (
      realtime.messages.extension = 'broadcast' and (select realtime.topic()) like 'typing:%'
      and (select auth.uid())::text in (split_part((select realtime.topic()), ':', 2), split_part((select realtime.topic()), ':', 3)))$p$;
    execute $p$create policy typing_send on realtime.messages for insert to authenticated with check (
      realtime.messages.extension = 'broadcast' and (select realtime.topic()) like 'typing:%'
      and (select auth.uid())::text in (split_part((select realtime.topic()), ':', 2), split_part((select realtime.topic()), ':', 3)))$p$;
  end if;
exception when others then raise notice 'typing policies not created: %', sqlerrm;
end $$;
