-- fiiyou: security audit of YOUR live Supabase database. Read-only: it changes nothing.
-- Paste into the Supabase SQL editor and run. Every row is something to look at; "OK" rows say the check passed.
-- What the public (anon) key in the website's code can do is decided only by these things, so that is what is checked.

with
t_nors as (   -- 1. tables anyone could read AND write through the API, because row level security is off
  select 'tables without row level security' as check_name, 'PROBLEM' as status, c.relname::text as detail
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
), t_anon as (   -- 2. policies that also apply to people who are NOT signed in (only public place names should be here)
  select 'policies that apply to signed-out visitors', 'REVIEW', tablename || ': ' || policyname || ' (' || cmd || ') using ' || coalesce(qual, with_check, 'true')
  from pg_policies
  where schemaname = 'public' and (roles && array['anon', 'public']::name[])
    and coalesce(qual, with_check, 'true') not ilike '%auth.uid()%'
), v_open as (   -- 3. views run with their owner's rights and skip row level security unless security_invoker is on
  select 'views that skip row level security', 'PROBLEM', c.relname::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), 'false') not in ('true', 'on')
), f_open as (   -- 4. functions the public key can call that run with owner rights and never look at who is calling
  select 'functions callable without signing in that never check auth.uid()', 'REVIEW', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
    and p.prorettype <> 'pg_catalog.trigger'::regtype
    and has_function_privilege('anon', p.oid, 'execute')
    and pg_get_functiondef(p.oid) not ilike '%auth.uid()%'
), b_open as (   -- 5. storage buckets that anyone on the internet can read by URL
  select 'public storage buckets', 'REVIEW', id::text from storage.buckets where public
), all_rows as (
  select * from t_nors union all select * from t_anon union all select * from v_open union all select * from f_open union all select * from b_open
)
select * from all_rows
union all
select 'summary', case when exists (select 1 from all_rows where status = 'PROBLEM') then 'PROBLEM' else 'OK' end,
       (select count(*) from all_rows where status = 'PROBLEM') || ' problems, ' || (select count(*) from all_rows where status = 'REVIEW') || ' to review'
order by 2, 1, 3;
-- Expected for a correct fiiyou install: no PROBLEM rows. REVIEW rows you should recognise:
--   policies for signed-out visitors: localities_read (public place names). The notifications / push_subscriptions policies only match your own rows.
--   functions: email_banned and username_available (the sign-up screen needs them before you are signed in).
