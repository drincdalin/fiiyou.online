-- =====================================================================
-- 0002: RPC functions (all writes to friendships/top_friends go through here)
-- =====================================================================

create function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(p_username) ~ '^[a-z0-9_]{3,24}$'
     and not exists (select 1 from public.profiles where username = lower(p_username))
$$;

-- ---------- friends ----------
create function public.send_friend_request(p_target uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); ex public.friendships; fid uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if p_target = me then raise exception 'cannot_friend_self'; end if;
  if not exists (select 1 from public.profiles where id = p_target)
     or public.is_blocked_between(me, p_target) then
    raise exception 'not_found';
  end if;

  select * into ex from public.friendships
   where (requester_id = me and addressee_id = p_target)
      or (requester_id = p_target and addressee_id = me);
  if found then
    if ex.status = 'pending' and ex.requester_id = p_target then   -- they asked first: accept
      update public.friendships set status = 'accepted', responded_at = now() where id = ex.id;
    end if;
    return ex.id;
  end if;

  insert into public.friendships (requester_id, addressee_id) values (me, p_target) returning id into fid;
  return fid;
end $$;

create function public.respond_friend_request(p_request uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.friendships
                  where id = p_request and addressee_id = me and status = 'pending') then
    raise exception 'not_found';
  end if;
  if p_accept then
    update public.friendships set status = 'accepted', responded_at = now() where id = p_request;
  else
    delete from public.friendships where id = p_request;
  end if;
end $$;

-- Unfriend, decline, or cancel an outgoing request.
create function public.remove_friend(p_other uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated'; end if;
  delete from public.friendships
   where (requester_id = me and addressee_id = p_other) or (requester_id = p_other and addressee_id = me);
  delete from public.top_friends
   where (profile_id = me and friend_id = p_other) or (profile_id = p_other and friend_id = me);
end $$;

-- Replace the whole Top 8 atomically. Order of the array = rank.
create function public.set_top_friends(p_friend_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n int := coalesce(array_length(p_friend_ids, 1), 0);
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if n > 8 then raise exception 'too_many'; end if;
  if n <> (select count(distinct x) from unnest(p_friend_ids) x) then raise exception 'duplicates'; end if;
  if exists (select 1 from unnest(p_friend_ids) x where not public.are_friends(me, x)) then
    raise exception 'not_friends';
  end if;
  delete from public.top_friends where profile_id = me;
  insert into public.top_friends (profile_id, friend_id, rank)
  select me, fid, rnk::smallint from unnest(p_friend_ids) with ordinality as t(fid, rnk);
end $$;

-- Someone's accepted friends (for browsing profiles MySpace-style).
create function public.friends_of(p_profile uuid)
returns table (id uuid, username text, display_name text, avatar_path text, locality_id int)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_path, p.locality_id
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = p_profile then f.addressee_id else f.requester_id end
  where auth.uid() is not null
    and f.status = 'accepted'
    and (f.requester_id = p_profile or f.addressee_id = p_profile)
    and not public.is_blocked_between(auth.uid(), p_profile)
    and not public.is_blocked_between(auth.uid(), p.id)
  order by f.responded_at desc nulls last
$$;

-- ---------- map ----------
-- Friends who opted into the map, placed at their locality (never exact coords).
create function public.friends_map()
returns table (id uuid, username text, display_name text, avatar_path text,
               locality_id int, locality_name text, lat double precision, lng double precision)
language sql stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_path, l.id, l.name, l.lat, l.lng
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  join public.localities l on l.id = p.locality_id
  where f.status = 'accepted'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
    and p.show_on_map and l.lat is not null
$$;

-- ---------- discovery: random or newest. No engagement ranking, by design. ----------
create function public.discover_profiles(p_locality int default null, p_mode text default 'random', p_limit int default 20)
returns setof public.profiles
language sql stable set search_path = public as $$
  select p.* from public.profiles p
  where p.id <> auth.uid()
    and (p_locality is null or p.locality_id = p_locality)
    and not exists (
      select 1 from public.friendships f
      where (f.requester_id = auth.uid() and f.addressee_id = p.id)
         or (f.requester_id = p.id and f.addressee_id = auth.uid()))
  order by case when p_mode = 'new' then extract(epoch from p.created_at) end desc nulls last, random()
  limit least(greatest(p_limit, 1), 50)
$$;

create function public.search_profiles(p_query text, p_limit int default 20)
returns setof public.profiles
language sql stable set search_path = public as $$
  select p.* from public.profiles p
  where length(trim(p_query)) >= 2
    and (p.username     ilike '%' || replace(replace(replace(lower(trim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or p.display_name ilike '%' || replace(replace(replace(lower(trim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  order by p.username
  limit least(greatest(p_limit, 1), 50)
$$;

-- ---------- local feed: strictly reverse-chronological ----------
create function public.local_feed(
  p_locality int default null, p_only_friends boolean default false,
  p_before timestamptz default null, p_limit int default 20, p_kind text default null)
returns table (id uuid, author_id uuid, locality_id int, kind text, body text, image_path text,
               event_at timestamptz, event_place text, visibility text, created_at timestamptz,
               author_username text, author_display_name text, author_avatar_path text,
               comment_count bigint)
language sql stable set search_path = public as $$
  select po.id, po.author_id, po.locality_id, po.kind, po.body, po.image_path,
         po.event_at, po.event_place, po.visibility, po.created_at,
         pr.username, pr.display_name, pr.avatar_path,
         (select count(*) from public.post_comments c where c.post_id = po.id)
  from public.posts po
  join public.profiles pr on pr.id = po.author_id
  where (p_locality is null or po.locality_id = p_locality)
    and (p_before is null or po.created_at < p_before)
    and (p_kind is null or po.kind = p_kind)
    and (not p_only_friends or po.author_id = auth.uid() or exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and ((f.requester_id = auth.uid() and f.addressee_id = po.author_id)
              or (f.requester_id = po.author_id and f.addressee_id = auth.uid()))))
  order by po.created_at desc
  limit least(greatest(p_limit, 1), 50)
$$;

-- ---------- editor: save drag/resize/rotate of many cards atomically ----------
-- Runs as the caller, so RLS guarantees only their own cards change.
create function public.save_card_layout(p_layout jsonb) returns void
language plpgsql set search_path = public as $$
begin
  if jsonb_typeof(p_layout) <> 'array' or jsonb_array_length(p_layout) > 60 then
    raise exception 'bad_layout';
  end if;
  update public.profile_cards c set
    x = coalesce((e->>'x')::int, c.x),
    y = coalesce((e->>'y')::int, c.y),
    w = coalesce((e->>'w')::int, c.w),
    h = coalesce((e->>'h')::int, c.h),
    z = coalesce((e->>'z')::int, c.z),
    rotation = coalesce((e->>'rotation')::numeric, c.rotation)
  from jsonb_array_elements(p_layout) e
  where c.id = (e->>'id')::uuid;
end $$;

-- ---------- privacy: export + delete ----------
create function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated'; end if;
  return jsonb_build_object(
    'profile',        (select to_jsonb(p) from public.profiles p where p.id = me),
    'cards',          (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.profile_cards c where c.profile_id = me),
    'friendships',    (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from public.friendships f where me in (f.requester_id, f.addressee_id)),
    'top_friends',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.top_friends t where t.profile_id = me),
    'posts',          (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.posts p where p.author_id = me),
    'post_comments',  (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.post_comments c where c.author_id = me),
    'wall_written',   (select coalesce(jsonb_agg(to_jsonb(w)), '[]') from public.wall_comments w where w.author_id = me),
    'wall_received',  (select coalesce(jsonb_agg(to_jsonb(w)), '[]') from public.wall_comments w where w.profile_id = me),
    'blocks',         (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.blocks b where b.blocker_id = me)
  );
end $$;

-- Deletes the auth user; everything else cascades. Delete storage files FIRST
-- from the client (api/auth.js does this) — deleting storage rows from SQL
-- would orphan the underlying files.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------- lock down execute grants ----------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
-- the signup form needs this one before login:
grant execute on function public.username_available(text) to anon;
