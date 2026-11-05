-- fiiyou: the two database webhooks for push notifications, created with SQL instead of clicking through the dashboard.
-- Run it once in the Supabase SQL editor AFTER the Edge Function is deployed (docs/PUSH_SETUP.md, steps 1 and 2).
-- It does exactly what Dashboard -> Database -> Webhooks does, and cannot forget the second one (chat messages).
-- Re-running is safe: it replaces the two triggers. Fill in the two values below first.
do $$
declare
  fn_url  text := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-push';   -- Project Settings -> General -> Reference ID
  secret  text := 'THE-SAME-WEBHOOK_SECRET-YOU-SET-WITH-supabase-secrets-set';
  hdrs    text;
begin
  if fn_url like '%YOUR-PROJECT-REF%' or secret like 'THE-SAME-%' then
    raise exception 'Fill in fn_url and secret at the top of this script first';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'supabase_functions' and p.proname = 'http_request') then
    raise exception 'supabase_functions.http_request() does not exist on this project: create the two webhooks in Dashboard -> Database -> Webhooks instead (docs/PUSH_SETUP.md, step 3)';
  end if;
  hdrs := json_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret)::text;

  drop trigger if exists push_on_notification on public.notifications;
  execute format('create trigger push_on_notification after insert on public.notifications for each row execute function supabase_functions.http_request(%L, %L, %L, %L, %L)',
                 fn_url, 'POST', hdrs, '{}', '5000');

  drop trigger if exists push_on_message on public.messages;
  execute format('create trigger push_on_message after insert on public.messages for each row execute function supabase_functions.http_request(%L, %L, %L, %L, %L)',
                 fn_url, 'POST', hdrs, '{}', '5000');
end $$;
-- Check:  select tgrelid::regclass as "table", tgname from pg_trigger where tgname in ('push_on_notification', 'push_on_message');   -> 2 rows
