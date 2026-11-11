# Moderation setup (all in the browser, no terminal)

1. Copy the files from this zip over your repo (same paths), push to GitHub, Vercel rebuilds.
2. Supabase -> SQL Editor -> paste supabase/migrations/0035_moderation.sql -> Run.
3. Supabase -> Edge Functions -> Deploy a new function -> Via Editor. Name: send-moderation-email.
   Paste the whole of moderation-email-function.ts. Deploy. In the function's settings turn OFF "Verify JWT".
4. Edge Functions -> Secrets: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MOD_WEBHOOK_SECRET, SITE_URL, SUPPORT_EMAIL.
5. SQL Editor -> supabase/moderation_webhook.sql: fill in project ref + the same secret -> Run.
6. Optional moderator: insert into public.staff_roles (user_id, role) select id, 'moderator' from auth.users where email = 'mod@example.com';
