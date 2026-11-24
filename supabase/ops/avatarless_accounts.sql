-- avatarless_accounts.sql
-- Read-only listing of every profile that still has no photo. The operator runs this before applying 0053 (and again afterwards)
-- to see who the new gate will hold on the photo step. It writes nothing.
--
--   psql "$DB_URL" -f supabase/ops/avatarless_accounts.sql
--
-- The first query is the gate's exact condition: anyone who is onboarded but has no avatar_path will be held on the photo step when
-- they next sign in (App.jsx:  me.onboarded_at === null || !me.avatar_path). The second is every avatarless profile, onboarded or not.

-- 1. Accounts the gate will hold (onboarded but no photo). These are the ones that must upload before they can reach the app again.
select p.id,
       p.username,
       p.display_name,
       p.created_at,
       p.onboarded_at,
       u.email,
       u.last_sign_in_at
from public.profiles p
join auth.users u on u.id = p.id
where p.avatar_path is null
  and p.onboarded_at is not null
order by p.created_at;

-- 2. Every avatarless profile, for completeness (includes anyone mid-onboarding who simply has not reached the photo step yet).
select p.id,
       p.username,
       p.display_name,
       p.created_at,
       p.onboarded_at
from public.profiles p
where p.avatar_path is null
order by p.created_at;
