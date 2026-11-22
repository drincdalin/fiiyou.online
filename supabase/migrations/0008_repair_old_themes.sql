-- 0008: repair themes saved before 0006 narrowed the allowed values (e.g. "radius":"4").
-- Those rows failed the theme CHECK on ANY update of the profile (saving, deleting a locality...).
-- Keeps every still-valid key, maps old radius 2/4 -> 8, drops the rest. Safe to run more than once.
update public.profiles p set theme = coalesce((
  select jsonb_object_agg(t.k, t.v)
  from (select e.key as k,
               case when e.key = 'radius' and e.value #>> '{}' in ('2','4') then '"8"'::jsonb else e.value end as v
        from jsonb_each(p.theme) e) t
  where public.is_valid_theme(jsonb_build_object(t.k, t.v))
), '{}'::jsonb)
where not public.is_valid_theme(theme);
