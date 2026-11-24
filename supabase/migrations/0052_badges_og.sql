-- 0052: keep OG as an optional badge alongside beta, founder and donor.
alter table public.profile_badges drop constraint if exists profile_badges_kind_check;
alter table public.profile_badges add constraint profile_badges_kind_check check (kind in ('beta', 'og', 'founder', 'donor'));
