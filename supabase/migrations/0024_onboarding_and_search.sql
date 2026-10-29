-- 0024: (1) onboarding flag, (2) people search that ignores Romanian diacritics and can filter by locality.
-- Run once in the SQL editor.

-- ---- 1. onboarding ----
-- NULL = this person still has to go through the welcome steps after sign-up. Everyone who exists now is marked done.
alter table public.profiles add column if not exists onboarded_at timestamptz;
update public.profiles set onboarded_at = now() where onboarded_at is null;
-- (profiles only allow column-level updates, see 0011: this lets people set their OWN flag and nothing else new)
grant update (onboarded_at) on public.profiles to authenticated;

-- ---- 2. search ----
-- "stefan" finds "Ștefan", "curatele" finds "Curățele": both sides are lower-cased and unaccented.
create extension if not exists unaccent with schema extensions;

drop function if exists public.search_profiles(text, int);
create function public.search_profiles(p_query text, p_limit int default 20, p_locality int default null)
returns setof public.profiles
language sql stable set search_path = public as $$
  with q as (
    select replace(replace(replace(extensions.unaccent(lower(trim(p_query))), '\', '\\'), '%', '\%'), '_', '\_') as t
  )
  select p.* from public.profiles p, q
  where length(trim(p_query)) >= 2
    and (p_locality is null or p.locality_id = p_locality)
    and (extensions.unaccent(lower(p.username))     like '%' || q.t || '%'
      or extensions.unaccent(lower(p.display_name)) like '%' || q.t || '%')
  -- names that START with the text come first, then the rest alphabetically
  order by (extensions.unaccent(lower(p.username)) like q.t || '%' or extensions.unaccent(lower(p.display_name)) like q.t || '%') desc,
           p.username
  limit least(greatest(p_limit, 1), 50)
$$;
revoke all on function public.search_profiles(text, int, int) from public, anon;
grant execute on function public.search_profiles(text, int, int) to authenticated;
