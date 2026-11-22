-- 0026_hashtags.sql
-- #hashtags in posts: parsed by a trigger (so it also works for edits), searchable via tag_post_ids(), trending via trending_tags().
-- Tag rule (keep in sync with Rich() in shared.jsx): '#' + 2..32 letters/digits/_ , not all digits, not glued to a word/URL.
-- Needs a UTF8 database with a non-"C" locale so that [[:alnum:]] matches ă â î ș ț (Supabase default is fine).

create table if not exists public.post_tags (
  post_id uuid not null references public.posts(id) on delete cascade,
  tag     text not null check (tag ~ '^[[:alnum:]_]{2,32}$' and tag !~ '^[0-9_]+$'),
  primary key (post_id, tag)
);
create index if not exists post_tags_tag_idx on public.post_tags (tag, post_id);

-- No policies on purpose: the app never reads this table directly, only through the functions below.
alter table public.post_tags enable row level security;

create or replace function public.extract_tags(p_text text) returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct t), '{}')
  from (
    select lower(m[1]) as t
    from regexp_matches(coalesce(p_text, ''), '(?<![[:alnum:]_#&/])#([[:alnum:]_]{2,32})', 'g') as m
  ) s
  where t !~ '^[0-9_]+$';
$$;

create or replace function public.sync_post_tags() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.body is not distinct from old.body and new.title is not distinct from old.title then
    return new;
  end if;
  delete from public.post_tags where post_id = new.id;
  insert into public.post_tags (post_id, tag)
    select new.id, t from unnest(public.extract_tags(coalesce(new.title, '') || ' ' || coalesce(new.body, ''))) as t;
  return new;
end $$;

drop trigger if exists posts_sync_tags on public.posts;
create trigger posts_sync_tags after insert or update of body, title on public.posts
  for each row execute function public.sync_post_tags();

-- Backfill existing posts.
insert into public.post_tags (post_id, tag)
  select p.id, t
  from public.posts p, unnest(public.extract_tags(coalesce(p.title, '') || ' ' || coalesce(p.body, ''))) as t
on conflict do nothing;

-- Newest-first ids of PUBLIC posts carrying a tag. The app then loads each one through get_post(), which applies
-- the normal visibility / block rules, so this function never has to know them. Friends-only posts are never listed here.
create or replace function public.tag_post_ids(p_tag text, p_before timestamptz default null, p_limit int default 20)
returns table (id uuid, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.created_at
  from public.post_tags t
  join public.posts p on p.id = t.post_id
  where auth.uid() is not null
    and t.tag = lower(p_tag)
    and p.visibility = 'public'
    and (p_before is null or p.created_at < p_before)
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create or replace function public.trending_tags(p_days int default 7, p_limit int default 8)
returns table (tag text, uses bigint)
language sql stable security definer set search_path = public as $$
  select t.tag, count(*) as uses
  from public.post_tags t
  join public.posts p on p.id = t.post_id
  where auth.uid() is not null
    and p.visibility = 'public'
    and p.created_at > now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
  group by t.tag
  order by count(*) desc, max(p.created_at) desc
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

revoke all on function public.tag_post_ids(text, timestamptz, int) from public;
revoke all on function public.trending_tags(int, int) from public;
grant execute on function public.tag_post_ids(text, timestamptz, int) to authenticated;
grant execute on function public.trending_tags(int, int) to authenticated;
