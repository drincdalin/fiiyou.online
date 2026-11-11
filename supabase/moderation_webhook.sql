-- fiiyou: database webhook that wakes the Edge Function `send-moderation-email` when a row lands in moderation_outbox.
-- Run once in the SQL editor AFTER the function is deployed. Same mechanism as push_webhooks.sql. Safe to re-run.
do $$
declare
  fn_url text := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-moderation-email';
  secret text := 'THE-SAME-WEBHOOK_SECRET-YOU-SET-WITH-supabase-secrets-set';
  hdrs   text;
begin
  if fn_url like '%YOUR-PROJECT-REF%' or secret like 'THE-SAME-%' then raise exception 'Fill in fn_url and secret first'; end if;
  hdrs := json_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret)::text;
  drop trigger if exists mail_on_moderation_outbox on public.moderation_outbox;
  execute format('create trigger mail_on_moderation_outbox after insert on public.moderation_outbox for each row execute function supabase_functions.http_request(%L, %L, %L, %L, %L)',
                 fn_url, 'POST', hdrs, '{}', '8000');
end $$;
-- Check:  select tgname from pg_trigger where tgname = 'mail_on_moderation_outbox';   -> 1 row
-- Stuck or failed mails:  select id, kind, status, attempts, last_error from public.moderation_outbox where status <> 'sent' order by created_at;
-- Resend them all:  curl -X POST https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-moderation-email -H 'x-webhook-secret: ...' -d '{"retry":true}'
