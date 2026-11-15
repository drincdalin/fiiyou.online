# Moderation setup (all in the browser, no terminal)

1. Copy the files from this zip over your repo (same paths), push to GitHub, Vercel rebuilds.
2. Supabase -> SQL Editor -> paste supabase/migrations/0035_moderation.sql -> Run.
3. Supabase -> Edge Functions -> Deploy a new function -> Via Editor. Name: send-moderation-email.
   Paste the whole of supabase/functions/send-moderation-email/index.ts. Deploy. In the function's settings turn OFF "Verify JWT".
4. Edge Functions -> Secrets: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MOD_WEBHOOK_SECRET, SITE_URL, SUPPORT_EMAIL.
5. SQL Editor -> supabase/moderation_webhook.sql: fill in project ref + the same secret -> Run. (It uses the pg_net extension directly, so the dashboard's "Database Webhooks" feature does not need to be enabled. Turn pg_net on under Database -> Extensions if it is off.)
6. Optional moderator: insert into public.staff_roles (user_id, role) select id, 'moderator' from auth.users where email = 'mod@example.com';
7. Recommended: SQL Editor -> supabase/moderation_retry_cron.sql (enable pg_cron first): every 10 minutes it sends any mail that is still pending or failed.

## Mails stay "pending"

`pending` with 0 attempts means the function never got as far as picking the mail up. (If it had tried and the mail server refused, the row would say `failed` and `last_error` would say why.) Check, in this order:

1. Run this to see the queue: `select id, kind, status, attempts, last_error, created_at from public.moderation_outbox order by created_at desc;`
2. Send everything stuck right now and read the answer (replace `<ref>` and `<secret>`):
   `curl -s -X POST https://<ref>.supabase.co/functions/v1/send-moderation-email -H "x-webhook-secret: <secret>" -H "Content-Type: application/json" -d '{"retry":true}'`
   - `{"error":"forbidden"}`: `MOD_WEBHOOK_SECRET` in the function secrets is not the same string you used here or in `moderation_webhook.sql`.
   - `{"error":"smtp_not_configured"}`: `SMTP_HOST`, `SMTP_USER` or `SMTP_PASS` is missing from the function secrets. The webhook gets the same answer, so mails stay pending.
   - `{"error":"mail_from_invalid"}`: the `MAIL_FROM` secret is missing or is not one plain address; the reply shows what the function sees. With Resend the login name is `resend`, which is not an address, so `MAIL_FROM` is required.
   - To see what the function is reading from its secrets (no password is shown), send `{"diag":true}` instead of `{"retry":true}`. It uses no mail attempts.
   - `Invalid JWT` or 401: turn "Verify JWT" OFF for the function.
   - 404: the function is not deployed under the name `send-moderation-email`.
   - `"failed:..."` for a mail: the text after it is the mail server's own reason (wrong password, sender domain not verified at the provider, blocked port). Use port 465.
   - `"sent"`: it works. If new mails still stay pending afterwards, the webhook is the problem: run `supabase/moderation_webhook.sql` again and check Database -> Triggers for `mail_on_moderation_outbox`.
3. Look at Edge Functions -> send-moderation-email -> Logs. No calls at all when a mail is queued means the trigger from step 5 is missing.

