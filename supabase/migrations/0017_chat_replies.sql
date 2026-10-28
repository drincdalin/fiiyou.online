-- Chat replies: run once in the Supabase SQL editor.
-- Adds messages.reply_to (the message being answered). It uses the same type as messages.id, so it works whether ids are uuid or bigint.
-- If the original message is deleted, the reply stays and just loses its quote.

do $$
declare t text;
begin
  select format_type(atttypid, atttypmod) into t
  from pg_attribute where attrelid = 'public.messages'::regclass and attname = 'id';
  execute format('alter table public.messages add column if not exists reply_to %s references public.messages(id) on delete set null', t);
end $$;

create index if not exists messages_reply_to_idx on public.messages (reply_to);

-- Only needed if your messages table uses column-level grants and sending a reply fails with "permission denied":
-- grant insert (reply_to) on public.messages to authenticated;

-- Make PostgREST see the new column straight away
notify pgrst, 'reload schema';
