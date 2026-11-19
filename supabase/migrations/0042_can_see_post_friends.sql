-- 0042: friends-only posts. People who are friends with the author can now be notified about mentions and replies on them
-- (0028 only let the author through). Public posts and every other rule are unchanged. Safe to run twice.
create or replace function public._can_see_post(p_post uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.posts p where p.id = p_post
    and (p.visibility <> 'friends' or p.author_id = p_user or public.are_friends(p.author_id, p_user)))
$$;
revoke all on function public._can_see_post(uuid, uuid) from public, anon, authenticated;
