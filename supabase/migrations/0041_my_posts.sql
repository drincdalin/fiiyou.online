-- 0041: "Your posts" screen (Settings -> Your posts, and a button on your own profile).
-- my_posts lists only the CALLER's posts, newest first, with the same counts the feed shows, and can filter by kind, by who can see them
-- and by a word in the text. my_post_stats gives the totals for the header. Both run as the caller, so row level security still applies,
-- and anon cannot call them.
create index if not exists posts_author_idx on public.posts(author_id, created_at desc);   -- the list reads only the caller's posts, newest first

create or replace function public.my_posts(
  p_before timestamptz default null, p_limit int default 30,
  p_kind text default null, p_visibility text default null, p_q text default null)
returns table (id uuid, kind text, title text, body text, image_path text, extra_images text[], event_at timestamptz, event_place text,
  place_name text, visibility text, created_at timestamptz, edited_at timestamptz, comment_count bigint, like_count bigint)
language sql stable set search_path = public as $$
  select po.id, po.kind, po.title, po.body, po.image_path, po.extra_images, po.event_at, po.event_place, pl.name, po.visibility, po.created_at, po.edited_at,
         (select count(*) from public.post_comments c where c.post_id = po.id),
         (select count(*) from public.post_likes l where l.post_id = po.id)
  from public.posts po
  left join public.places pl on pl.id = po.place_id
  where po.author_id = auth.uid()
    and (p_before is null or po.created_at < p_before)
    and (p_kind is null or po.kind = p_kind)
    and (p_visibility is null or po.visibility = p_visibility)
    and (nullif(btrim(p_q), '') is null
         or position(lower(btrim(p_q)) in lower(po.body)) > 0
         or position(lower(btrim(p_q)) in lower(coalesce(po.title, ''))) > 0)
  order by po.created_at desc
  limit least(greatest(p_limit, 1), 50)
$$;
revoke all on function public.my_posts(timestamptz, int, text, text, text) from public, anon;
grant execute on function public.my_posts(timestamptz, int, text, text, text) to authenticated;

create or replace function public.my_post_stats()
returns table (posts bigint, events bigint, friends_only bigint, likes bigint, comments bigint)
language sql stable set search_path = public as $$
  select count(*), count(*) filter (where po.kind = 'event'), count(*) filter (where po.visibility = 'friends'),
         coalesce(sum((select count(*) from public.post_likes l where l.post_id = po.id)), 0)::bigint,
         coalesce(sum((select count(*) from public.post_comments c where c.post_id = po.id)), 0)::bigint
  from public.posts po where po.author_id = auth.uid()
$$;
revoke all on function public.my_post_stats() from public, anon;
grant execute on function public.my_post_stats() to authenticated;
