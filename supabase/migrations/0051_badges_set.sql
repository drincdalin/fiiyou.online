-- 0051: profile badge set becomes beta / founder / donor.
-- The old "og" kind was never assigned; fold it into founder if it ever was.
update public.profile_badges set kind = 'founder' where kind = 'og';
alter table public.profile_badges drop constraint if exists profile_badges_kind_check;
alter table public.profile_badges add constraint profile_badges_kind_check check (kind in ('beta', 'founder', 'donor'));
