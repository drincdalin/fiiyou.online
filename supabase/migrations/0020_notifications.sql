-- Notifications (Instagram style): likes on my posts / photos, comments on my posts, friend requests and accepted requests.
-- Rows are created by triggers (security definer), so nobody can fake a notification; people can only read / mark / delete their own.
-- Run once in the SQL editor. Re-running is safe.

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,   -- who receives it
  actor_id   uuid not null references public.profiles(id) on delete cascade,   -- who did it
  type       text not null check (type in ('post_like', 'photo_like', 'comment', 'friend_request', 'friend_accept')),
  post_id    uuid references public.posts(id) on delete cascade,
  photo_id   uuid references public.photos(id) on delete cascade,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where not read;

alter table public.notifications enable row level security;
drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_update on public.notifications;
drop policy if exists notifications_delete on public.notifications;
create policy notifications_select on public.notifications for select using (user_id = auth.uid());
create policy notifications_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete using (user_id = auth.uid());
-- no insert policy on purpose: only the triggers below write here
revoke insert on public.notifications from anon, authenticated;
-- the app only ever flips "read"
revoke update on public.notifications from anon, authenticated;
grant update (read) on public.notifications to authenticated;

-- ---------- post likes ----------
create or replace function public.notify_post_like() returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select author_id into owner from posts where id = new.post_id;
  if owner is not null and owner <> new.user_id then
    insert into notifications (user_id, actor_id, type, post_id) values (owner, new.user_id, 'post_like', new.post_id);
  end if;
  return new;
end $$;
create or replace function public.unnotify_post_like() returns trigger language plpgsql security definer set search_path = public as $$
begin   -- unliking takes the notification back, so like / unlike spam cannot pile up
  delete from notifications where type = 'post_like' and post_id = old.post_id and actor_id = old.user_id;
  return old;
end $$;
drop trigger if exists trg_notify_post_like on public.post_likes;
create trigger trg_notify_post_like after insert on public.post_likes for each row execute function public.notify_post_like();
drop trigger if exists trg_unnotify_post_like on public.post_likes;
create trigger trg_unnotify_post_like after delete on public.post_likes for each row execute function public.unnotify_post_like();

-- ---------- photo likes ----------
create or replace function public.notify_photo_like() returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select owner_id into owner from photos where id = new.photo_id;
  if owner is not null and owner <> new.user_id then
    insert into notifications (user_id, actor_id, type, photo_id) values (owner, new.user_id, 'photo_like', new.photo_id);
  end if;
  return new;
end $$;
create or replace function public.unnotify_photo_like() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from notifications where type = 'photo_like' and photo_id = old.photo_id and actor_id = old.user_id;
  return old;
end $$;
drop trigger if exists trg_notify_photo_like on public.photo_likes;
create trigger trg_notify_photo_like after insert on public.photo_likes for each row execute function public.notify_photo_like();
drop trigger if exists trg_unnotify_photo_like on public.photo_likes;
create trigger trg_unnotify_photo_like after delete on public.photo_likes for each row execute function public.unnotify_photo_like();

-- ---------- comments ----------
create or replace function public.notify_comment() returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select author_id into owner from posts where id = new.post_id;
  if owner is not null and owner <> new.author_id then
    insert into notifications (user_id, actor_id, type, post_id) values (owner, new.author_id, 'comment', new.post_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_comment on public.post_comments;
create trigger trg_notify_comment after insert on public.post_comments for each row execute function public.notify_comment();

-- ---------- friend requests / accepted requests ----------
create or replace function public.notify_friendship() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    insert into notifications (user_id, actor_id, type) values (new.addressee_id, new.requester_id, 'friend_request');
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status is distinct from 'accepted' then
    delete from notifications where type = 'friend_request' and user_id = new.addressee_id and actor_id = new.requester_id;   -- the request is answered
    insert into notifications (user_id, actor_id, type) values (new.requester_id, new.addressee_id, 'friend_accept');
  elsif tg_op = 'DELETE' then   -- request cancelled or declined
    delete from notifications where type = 'friend_request' and user_id = old.addressee_id and actor_id = old.requester_id;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_notify_friendship on public.friendships;
create trigger trg_notify_friendship after insert or update or delete on public.friendships for each row execute function public.notify_friendship();

-- ---------- realtime (the bell updates without waiting for the 30 s poll) ----------
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;
