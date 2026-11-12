-- 0038: smaller answers. Run once in the Supabase SQL editor.
-- discover_profiles() and search_profiles() returned the WHOLE profiles row (theme, custom_css, music, bio ...: several KB per person) although every
-- list in the app (Home "new people", Search, People, Onboarding) only shows name, avatar, headline and locality. Same filters, same order, fewer columns.

drop function if exists public.discover_profiles(int, text, int);
create function public.discover_profiles(p_locality int default null, p_mode text default 'random', p_limit int default 20)
returns table (id uuid, username text, display_name text, avatar_path text, locality_id int, headline text)
language sql stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_path, p.locality_id, p.headline from public.profiles p
  where p.id <> auth.uid()
    and (p_locality is null or p.locality_id = p_locality)
    and not exists (
      select 1 from public.friendships f
      where (f.requester_id = auth.uid() and f.addressee_id = p.id)
         or (f.requester_id = p.id and f.addressee_id = auth.uid()))
  order by case when p_mode = 'new' then extract(epoch from p.created_at) end desc nulls last, random()
  limit least(greatest(p_limit, 1), 50)
$$;
revoke all on function public.discover_profiles(int, text, int) from public, anon;
grant execute on function public.discover_profiles(int, text, int) to authenticated;

drop function if exists public.search_profiles(text, int, int);
create function public.search_profiles(p_query text, p_limit int default 20, p_locality int default null)
returns table (id uuid, username text, display_name text, avatar_path text, locality_id int, headline text)
language sql stable set search_path = public as $$
  with q as (
    select replace(replace(replace(extensions.unaccent(lower(trim(p_query))), '\', '\\'), '%', '\%'), '_', '\_') as t
  )
  select p.id, p.username, p.display_name, p.avatar_path, p.locality_id, p.headline from public.profiles p, q
  where length(trim(p_query)) >= 2
    and (p_locality is null or p.locality_id = p_locality)
    and (extensions.unaccent(lower(p.username))     like '%' || q.t || '%'
      or extensions.unaccent(lower(p.display_name)) like '%' || q.t || '%')
  order by (extensions.unaccent(lower(p.username)) like q.t || '%' or extensions.unaccent(lower(p.display_name)) like q.t || '%') desc,
           p.username
  limit least(greatest(p_limit, 1), 50)
$$;
revoke all on function public.search_profiles(text, int, int) from public, anon;
grant execute on function public.search_profiles(text, int, int) to authenticated;
