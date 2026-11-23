-- 0050: profile badges + profile likes.
-- Badges are written only from the control-room dashboard (direct Postgres), never by clients.
-- Profile likes are ordinary content writes, protected by RLS and a notification trigger.

create table if not exists public.profile_badges (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('beta', 'og', 'founder')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  primary key (profile_id, kind)
);
create index if not exists profile_badges_kind_idx on public.profile_badges (kind, granted_at desc);
alter table public.profile_badges enable row level security;
drop policy if exists profile_badges_read on public.profile_badges;
create policy profile_badges_read on public.profile_badges for select to authenticated using (true);
revoke all on public.profile_badges from anon, authenticated;
grant select on public.profile_badges to authenticated;

-- ---------------------------------------------------------------- profile likes
create table if not exists public.profile_likes (
  profile_id uuid not null references public.profiles(id) on delete cascade,   -- who is liked
  liker_id   uuid not null references public.profiles(id) on delete cascade,   -- who liked
  created_at timestamptz not null default now(),
  primary key (profile_id, liker_id),
  check (profile_id <> liker_id)
);
create index if not exists profile_likes_recent_idx on public.profile_likes (profile_id, created_at desc);
alter table public.profile_likes enable row level security;

drop policy if exists profile_likes_read on public.profile_likes;
create policy profile_likes_read on public.profile_likes for select to authenticated
  using (not public.is_blocked_between((select auth.uid()), profile_id));
drop policy if exists profile_likes_insert on public.profile_likes;
create policy profile_likes_insert on public.profile_likes for insert to authenticated
  with check (liker_id = (select auth.uid()) and not public.is_blocked_between((select auth.uid()), profile_id));
drop policy if exists profile_likes_delete on public.profile_likes;
create policy profile_likes_delete on public.profile_likes for delete to authenticated
  using (liker_id = (select auth.uid()));
revoke all on public.profile_likes from anon, authenticated;
grant select, insert, delete on public.profile_likes to authenticated;

drop trigger if exists profile_likes_rate on public.profile_likes;
create trigger profile_likes_rate before insert on public.profile_likes
  for each row execute function public.enforce_rate_limit('60', '1 hour', 'liker_id');

-- One count + "did I like this profile" in one round trip.
create or replace function public.profile_like_state(p_profile uuid)
returns table (count bigint, liked boolean)
language sql stable security definer set search_path = public as $$
  select count(*)::bigint, coalesce(bool_or(liker_id = auth.uid()), false)
    from public.profile_likes where profile_id = p_profile
$$;
revoke all on function public.profile_like_state(uuid) from public;
grant execute on function public.profile_like_state(uuid) to authenticated;

create or replace function public.profile_likers(p_profile uuid)
returns table (id uuid, username text, display_name text, avatar_path text, is_official boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_path, p.is_official
    from public.profile_likes l
    join public.profiles p on p.id = l.liker_id
   where l.profile_id = p_profile
     and not public.is_blocked_between(auth.uid(), l.liker_id)
   order by l.created_at desc
   limit 100
$$;
revoke all on function public.profile_likers(uuid) from public;
grant execute on function public.profile_likers(uuid) to authenticated;

-- Notifications: add profile_like to the allowed types.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in
  ('post_like','photo_like','comment','wall_comment','friend_request','friend_accept',
   'comment_like','reply','mention','comment_mention','profile_like')) not valid;

create or replace function public.notify_profile_like() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id <> new.liker_id then
    insert into public.notifications (user_id, actor_id, type)
    values (new.profile_id, new.liker_id, 'profile_like');
  end if;
  return new;
end $$;
create or replace function public.unnotify_profile_like() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.notifications
   where type = 'profile_like' and user_id = old.profile_id and actor_id = old.liker_id;
  return old;
end $$;
drop trigger if exists trg_notify_profile_like on public.profile_likes;
create trigger trg_notify_profile_like after insert on public.profile_likes
  for each row execute function public.notify_profile_like();
drop trigger if exists trg_unnotify_profile_like on public.profile_likes;
create trigger trg_unnotify_profile_like after delete on public.profile_likes
  for each row execute function public.unnotify_profile_like();
revoke all on function public.notify_profile_like() from public;
revoke all on function public.unnotify_profile_like() from public;
