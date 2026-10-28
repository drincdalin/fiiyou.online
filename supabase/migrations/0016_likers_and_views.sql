-- 0016: (1) "who liked my content" lists for posts and photos, (2) profile views count EVERY visit, not one per viewer per day.
-- Rename the file if 0016 is already taken.

-- ---- 1. likers ----
-- Likes had no timestamp, so we could not sort "newest first". Existing likes get the time of this migration.
alter table public.post_likes  add column created_at timestamptz not null default now();
alter table public.photo_likes add column created_at timestamptz not null default now();

-- Run as the caller (no security definer): RLS still applies, and the owner check below means
-- only the author of the post / owner of the photo gets any rows back.
create function public.post_likers(p_post uuid)
returns table (id uuid, username text, display_name text, avatar_path text, is_official boolean, created_at timestamptz)
language sql stable set search_path = public as $$
  select pr.id, pr.username, pr.display_name, pr.avatar_path, pr.is_official, l.created_at
  from public.post_likes l
  join public.posts po on po.id = l.post_id
  join public.profiles pr on pr.id = l.user_id
  where l.post_id = p_post and po.author_id = auth.uid()
  order by l.created_at desc
$$;

create function public.photo_likers(p_photo uuid)
returns table (id uuid, username text, display_name text, avatar_path text, is_official boolean, created_at timestamptz)
language sql stable set search_path = public as $$
  select pr.id, pr.username, pr.display_name, pr.avatar_path, pr.is_official, l.created_at
  from public.photo_likes l
  join public.photos ph on ph.id = l.photo_id
  join public.profiles pr on pr.id = l.user_id
  where l.photo_id = p_photo and ph.owner_id = auth.uid()
  order by l.created_at desc
$$;

revoke all on function public.post_likers(uuid)  from public, anon;
revoke all on function public.photo_likers(uuid) from public, anon;
grant execute on function public.post_likers(uuid)  to authenticated;
grant execute on function public.photo_likers(uuid) to authenticated;

-- ---- 2. profile views: one row per visit ----
-- The old primary key (profile_id, viewer_id, day) is what made views unique per viewer per day.
alter table public.profile_views drop constraint profile_views_pkey;
alter table public.profile_views
  add column id uuid not null default gen_random_uuid() primary key,
  add column viewed_at timestamptz not null default now();
create index profile_views_profile_idx on public.profile_views(profile_id);

-- Same rules as before (logged in, not yourself, not blocked), minus "on conflict do nothing".
create or replace function public.record_profile_view(p_profile uuid) returns void language sql security definer set search_path = public as $$
  insert into public.profile_views (profile_id, viewer_id)
  select p_profile, auth.uid()
  where auth.uid() is not null and auth.uid() <> p_profile and not public.is_blocked_between(auth.uid(), p_profile)
$$;
-- profile_view_count() already does count(*) over all rows, so it now returns total visits without changes.
