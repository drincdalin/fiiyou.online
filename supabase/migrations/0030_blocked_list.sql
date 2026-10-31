-- 0030: the blocked list (Settings > Blocked).
-- profiles_read hides a blocked person from the person who blocked them, so a plain select/join on profiles returns nothing for them.
-- This returns only the caller's own blocks, with just the fields the list shows.
create or replace function public.list_blocked()
returns table (id uuid, username text, display_name text, avatar_path text, blocked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_path, b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc
$$;
revoke all on function public.list_blocked() from public, anon;
grant execute on function public.list_blocked() to authenticated;
