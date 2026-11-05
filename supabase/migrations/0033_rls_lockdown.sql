-- =====================================================================
-- fiiyou 0033: lock the database down by default.   Run once in the Supabase SQL editor (after 0032).
--
-- Where things stand: every table already has row level security with policies (supabase/audit_rls.sql proves it on YOUR database),
-- and the public "anon" key in the website's code cannot read any of them except the list of places. This migration makes that
-- a rule instead of a habit, so a table or function added later cannot be left open by mistake:
--
--  1. Row level security is switched on for every table in public that does not have it yet.
--  2. The signed-out role (anon, the public key) gets NO table privileges at all, except reading public.localities (place names for sign-up).
--     Even a table with a wrong or missing policy is then unreachable without signing in. New tables start that way too.
--  3. Signed-out visitors can call exactly two functions: email_banned() and username_available() (the sign-up screen needs both).
--     Every other function needs a signed-in person; new functions start that way too.
--
-- What it does NOT do, on purpose: it does not limit "profiles" to "auth.uid() = id". People find each other, read profiles and friends'
-- posts: that is the app. The policies decide who may see what (friends-only posts, blocked people, messages between two people only);
-- 50_hardening.sql tests them. Signing in is required for all of it.
-- =====================================================================

-- 1. row level security everywhere
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity loop
    execute format('alter table public.%I enable row level security', r.relname);
    raise notice 'row level security switched on for %', r.relname;
  end loop;
end $$;

-- 2. signed-out visitors: places only
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select on public.localities to anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- 3. signed-out visitors: two functions only. Signed-in people keep what they had (granted explicitly first, then the public default is removed).
do $$
declare r record;
begin
  for r in select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind in ('f', 'p') and p.proname not in ('email_banned', 'username_available') loop
    if has_function_privilege('authenticated', r.oid, 'execute') then
      execute format('grant execute on function public.%I(%s) to authenticated', r.proname, r.args);
    end if;
    execute format('revoke execute on function public.%I(%s) from public, anon', r.proname, r.args);
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public, anon;
