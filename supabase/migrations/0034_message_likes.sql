-- =====================================================================
-- fiiyou 0034: likes on chat messages (double-tap a message, like in Instagram).   Run once in the Supabase SQL editor (after 0033).
--
--  * One row = one person liked one message. Only the two people in a conversation can see or add likes on its messages
--    (the policy looks at the message itself, so a like can never leak who talks to whom).
--  * You can only add and remove YOUR OWN like.
--  * 150 new likes an hour per person, like post likes (0032).
--  * The chat updates live when the other person likes something.
-- Until this migration is run the app still works; messages just cannot be liked yet.
-- =====================================================================
create table if not exists public.message_likes (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_likes_user_created_idx on public.message_likes (user_id, created_at desc);

alter table public.message_likes enable row level security;
revoke all on public.message_likes from anon;
grant select, insert, delete on public.message_likes to authenticated;

drop policy if exists message_likes_read   on public.message_likes;
drop policy if exists message_likes_insert on public.message_likes;
drop policy if exists message_likes_delete on public.message_likes;
create policy message_likes_read on public.message_likes for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and (select auth.uid()) in (m.sender_id, m.recipient_id)));
create policy message_likes_insert on public.message_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.messages m where m.id = message_id and (select auth.uid()) in (m.sender_id, m.recipient_id)));
create policy message_likes_delete on public.message_likes for delete to authenticated
  using (user_id = (select auth.uid()));

drop trigger if exists message_likes_rate on public.message_likes;
create trigger message_likes_rate before insert on public.message_likes for each row execute function public.enforce_rate_limit('150', '1 hour', 'user_id');

do $$ begin
  alter publication supabase_realtime add table public.message_likes;
exception when duplicate_object then null; when undefined_object then null; end $$;
