-- Why are moderation emails stuck in "pending"?   Run the blocks one at a time in the Supabase SQL editor.
--
-- A row stays 'pending' only when the Edge Function never got as far as claiming it. If it had tried to send and the mail server said no,
-- the row would say 'failed' with the error in last_error. So "pending" = the webhook did not reach the function, or the function
-- turned the call away (wrong secret, SMTP secrets missing, function not deployed).

-- 1) What is in the outbox (never shows the address)
select id, kind, username, status, attempts, last_error, created_at, sent_at
from public.moderation_outbox order by created_at desc limit 20;

-- 2) Is the trigger that wakes the function there and enabled?  (tgenabled = 'O' is good. No row = run moderation_webhook.sql)
select tgname, tgenabled from pg_trigger where tgrelid = 'public.moderation_outbox'::regclass and not tgisinternal;

-- 3) What the function answered the last times it was called. Look at status_code / content:
--      200            it ran. content says sent / failed:<reason> / skipped
--      403 forbidden  the secret in the trigger is not the same as MOD_WEBHOOK_SECRET in Edge Functions -> Secrets (re-run moderation_webhook.sql with the right one)
--      500 smtp_not_configured   SMTP_HOST / SMTP_USER / SMTP_PASS are missing in Edge Functions -> Secrets
--      401            "Verify JWT" is still ON for the function -> turn it OFF in the function's settings
--      404            the function is not deployed under the name send-moderation-email
--      no rows        the trigger never fired (see 2) or pg_net is not enabled
select id, status_code, left(content::text, 200) as answer, error_msg, created
from net._http_response order by created desc limit 20;

-- 4) After fixing the cause: send everything that is stuck, right now (needs the real project ref + secret; do not commit them anywhere)
-- select net.http_post(
--   url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-moderation-email',
--   headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', 'THE-REAL-SECRET'),
--   body    := '{"retry": true}'::jsonb);
-- then run block 3 again (a few seconds later) and block 1: the rows should say 'sent'.
-- A row that reached 5 attempts is skipped on purpose: put it back with  select public.admin_requeue_email('<id>');  (or the Retry button in Admin).
