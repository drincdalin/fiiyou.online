# Moderation setup (self-hosted stack)

1. Apply the migrations, including `supabase/migrations/0035_moderation.sql` (run the migration loop against the self-hosted database).
2. The function files live at `/srv/fiiyou/supabase/volumes/functions/send-moderation-email/` (`index.ts` + `templates.ts`).
3. Put its secrets in `/srv/fiiyou/supabase/.env`:
   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_FROM_NAME`, `MOD_WEBHOOK_SECRET`, `SITE_URL`, `SUPPORT_EMAIL`.
   Then recreate the function so it reads them:
   `cd /srv/fiiyou/supabase && docker compose up -d --force-recreate --no-deps functions`
   `FUNCTIONS_VERIFY_JWT=false` is intended: the function proves itself with the `x-webhook-secret` header.
4. Run `supabase/moderation_webhook.sql` against the database, with the same `MOD_WEBHOOK_SECRET`. It uses pg_net directly and calls the stack's internal gateway, so the public tunnel is not involved.
5. Optional moderator: `insert into public.staff_roles (user_id, role) select id, 'moderator' from auth.users where email = 'mod@example.com';`
6. Recommended: run `supabase/moderation_retry_cron.sql`: every 10 minutes it sends any mail that is still pending or failed.

## Mails stay "pending"

`pending` with 0 attempts means the function never got as far as picking the mail up. (If it had tried and the mail server refused, the row would say `failed` and `last_error` would say why.) Check, in this order:

1. Run this to see the queue: `select id, kind, status, attempts, last_error, created_at from public.moderation_outbox order by created_at desc;`
2. Send everything stuck right now and read the answer (replace `<secret>`):
   `curl -s -X POST https://api.fiiyou.online/functions/v1/send-moderation-email -H "x-webhook-secret: <secret>" -H "Content-Type: application/json" -d '{"retry":true}'`
   - `{"error":"forbidden"}`: `MOD_WEBHOOK_SECRET` in `.env` is not the same string you used here or in `moderation_webhook.sql`.
   - `{"error":"smtp_not_configured"}`: `SMTP_HOST`, `SMTP_USER` or `SMTP_PASS` is missing from `.env`. The webhook gets the same answer, so mails stay pending.
   - `{"error":"mail_from_invalid"}`: `MAIL_FROM` is missing or is not one plain address; the reply shows what the function sees. With Resend the login name is `resend`, which is not an address, so `MAIL_FROM` is required.
   - To see what the function is reading from its secrets (no password is shown), send `{"diag":true}` instead of `{"retry":true}`. It uses no mail attempts.
   - `Invalid JWT` or 401: `FUNCTIONS_VERIFY_JWT` must be `false` in `.env`; recreate the `functions` service.
   - 404: the function is not mounted at `volumes/functions/send-moderation-email/`.
   - `"failed:..."` for a mail: the text after it is the mail server's own reason (wrong password, sender domain not verified at the provider, blocked port). Use port 465.
   - `"sent"`: it works. If new mails still stay pending afterwards, the webhook is the problem: run `supabase/moderation_webhook.sql` again and check `select tgname from pg_trigger where tgrelid = 'public.moderation_outbox'::regclass and not tgisinternal;`.
3. Look at `docker compose logs -f functions`. No calls at all when a mail is queued means the trigger from step 4 is missing.
