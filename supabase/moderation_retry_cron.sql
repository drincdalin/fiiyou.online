-- fiiyou: safety net for moderation e-mails. Every 10 minutes it asks the Edge Function `send-moderation-email` to send anything
-- still 'pending' or 'failed' (up to 5 attempts per mail). Without it a mail whose webhook call was lost waits until a person retries by hand.
-- Run once against the self-hosted database, AFTER the function is deployed and moderation_webhook.sql has been run. Safe to re-run (it replaces its own job).
-- Needs pg_cron and pg_net in shared_preload_libraries (the self-hosted stack enables both by default).
do $$
declare
  fn_url text := 'http://api-gw:8000/functions/v1/send-moderation-email';
  secret text := 'THE-SAME-MOD_WEBHOOK_SECRET-AS-IN-THE-FUNCTION-SECRETS';
  hdrs   text;
begin
  if secret like 'THE-SAME-%' then raise exception 'Fill in the webhook secret first'; end if;
  hdrs := json_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret)::text;
  perform cron.unschedule(jobid) from cron.job where jobname = 'moderation-mail-sweep';
  perform cron.schedule('moderation-mail-sweep', '*/10 * * * *',
    format($job$select net.http_post(url := %L, headers := %L::jsonb, body := '{"sweep":true}'::jsonb, timeout_milliseconds := 15000)$job$, fn_url, hdrs));
end $$;
-- To see it working:  select jobname, schedule, active from cron.job;   and   select status, count(*) from public.moderation_outbox group by 1;
