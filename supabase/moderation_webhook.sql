-- fiiyou: wakes the Edge Function `send-moderation-email` when a row lands in moderation_outbox.
-- Run once against the self-hosted database AFTER the function is deployed. Safe to re-run.
--
-- It calls the database's own pg_net extension, so it does NOT need the "Database Webhooks" feature (the supabase_functions schema).
-- The function is called through the stack's own gateway (`api-gw:8000`), so this works even when the public tunnel is down.
create extension if not exists pg_net;

-- One small function both this script and push_webhooks.sql use. It tells the Edge Function a row was inserted.
-- A failed call never blocks the insert (the moderation action must still work); the mail then waits for the scheduled retry or a manual {"retry":true}.
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
  fn_url text := 'http://api-gw:8000/functions/v1/send-moderation-email';
  secret text := 'THE-SAME-MOD_WEBHOOK_SECRET-AS-IN-THE-FUNCTION-SECRETS';
begin
  if secret like 'THE-SAME-%' then raise exception 'Fill in the webhook secret first'; end if;
  drop trigger if exists mail_on_moderation_outbox on public.moderation_outbox;
  execute format('create trigger mail_on_moderation_outbox after insert on public.moderation_outbox for each row execute function public.fiiyou_call_edge(%L, %L, %L)',
                 fn_url, trim(secret), 'id_only');
end $$;
-- Check:  select tgname from pg_trigger where tgrelid = 'public.moderation_outbox'::regclass and not tgisinternal;   -> mail_on_moderation_outbox
-- What the function answered to each call:  select status_code, content, error_msg, created from net._http_response order by created desc limit 5;
