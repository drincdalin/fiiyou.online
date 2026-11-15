-- fiiyou: the two triggers that wake the Edge Function `send-push` (a new notification, a new chat message).
-- Run once in the Supabase SQL editor AFTER the Edge Function is deployed (docs/PUSH_SETUP.md, steps 1 and 2). Re-running is safe.
--
-- It calls the database's own pg_net extension, so it does NOT need the "Database Webhooks" feature (the supabase_functions schema).
-- Turn pg_net on first if it is off: Dashboard -> Database -> Extensions -> pg_net.
create extension if not exists pg_net;

-- Same helper as in moderation_webhook.sql (defined in both so either script can be run first). A failed call never blocks the insert.
create or replace function public.fiiyou_call_edge() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec jsonb;
begin
  rec := case when tg_argv[2] = 'id_only' then jsonb_build_object('id', new.id) else to_jsonb(new) end;
  perform net.http_post(
    url := tg_argv[0],
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', tg_argv[1]),
    body := jsonb_build_object('type', tg_op, 'table', tg_table_name, 'record', rec),
    timeout_milliseconds := 8000);
  return new;
exception when others then
  raise warning 'fiiyou_call_edge failed for %: %', tg_table_name, sqlerrm;
  return new;
end $$;
revoke all on function public.fiiyou_call_edge() from public, anon, authenticated;

do $$
declare
  fn_url  text := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-push';   -- Project Settings -> General -> Reference ID
  secret  text := 'THE-SAME-WEBHOOK_SECRET-YOU-SET-WITH-supabase-secrets-set';
begin
  if fn_url like '%YOUR-PROJECT-REF%' or secret like 'THE-SAME-%' then
    raise exception 'Fill in fn_url and secret at the top of this script first';
  end if;
  drop trigger if exists push_on_notification on public.notifications;
  execute format('create trigger push_on_notification after insert on public.notifications for each row execute function public.fiiyou_call_edge(%L, %L, %L)', fn_url, trim(secret), 'full');
  drop trigger if exists push_on_message on public.messages;
  execute format('create trigger push_on_message after insert on public.messages for each row execute function public.fiiyou_call_edge(%L, %L, %L)', fn_url, trim(secret), 'full');
end $$;
-- Check:  select tgrelid::regclass as "table", tgname from pg_trigger where tgname in ('push_on_notification', 'push_on_message');   -> 2 rows
-- What the function answered to each call:  select status_code, content, error_msg, created from net._http_response order by created desc limit 5;
