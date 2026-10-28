-- 0016: load ONE post by id (used by the #/post/<id> page that shared-post cards in chat open).
-- Same columns as local_feed, and like local_feed it runs as the caller (no security definer), so the posts RLS
-- policies decide who can see it: a friends-only post still returns nothing for people who may not see it.
create function public.get_post(p_id uuid)
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
  where po.id = p_id
$$;
revoke all on function public.get_post(uuid) from public, anon;
grant execute on function public.get_post(uuid) to authenticated;
