-- fiiyou: database webhook that wakes the Edge Function `send-moderation-email` when a row lands in moderation_outbox.
-- Run once in the SQL editor AFTER the function is deployed. Same mechanism as push_webhooks.sql. Safe to re-run.
do $$
declare
  fn_url text := 'https://imwgljavptixnmhstufg.supabase.co/functions/v1/send-moderation-email';
  secret text := '7dc5162d2d97c6f7a691dd44aa2d52d902f9aded0bf0ff25dbeadd5cf170a815';
  hdrs   text;
begin
  if fn_url like '%YOUR-PROJECT-REF%' or secret like 'THE-SAME-%' then raise exception 'Fill in fn_url and secret first'; end if;
  hdrs := json_build_object('Content-Type', 'application/json', 'x-webhook-secret', secret)::text;
  drop trigger if exists mail_on_moderation_outbox on public.moderation_outbox;
  execute format('create trigger mail_on_moderation_outbox after insert on public.moderation_outbox for each row execute function supabase_functions.http_request(%L, %L, %L, %L, %L)',
                 fn_url, 'POST', hdrs, '{}', '8000');
end $$;
