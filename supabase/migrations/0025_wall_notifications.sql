-- 0025: notification for "someone commented on my wall".
-- (post comments, post likes and photo likes are already covered by 0020_notifications.sql)
-- Run once in the SQL editor, AFTER 0020. Re-running is safe.
-- Uses public.wall_comments (profile_id = wall owner, author_id = who wrote it) from 0001_schema.sql.

-- 1. allow the new type
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('post_like', 'photo_like', 'comment', 'wall_comment', 'friend_request', 'friend_accept'));

-- 2. remember which wall comment it was, so deleting the comment also removes the notification
alter table public.notifications add column if not exists wall_comment_id uuid references public.wall_comments(id) on delete cascade;

-- 3. write the notification (security definer: nobody can fake one). Commenting on your own wall notifies nobody.
--    Who may write on a wall (blocks, wall_policy) is already enforced by the wall_comments insert policy.
create or replace function public.notify_wall_comment() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id <> new.author_id then
    insert into notifications (user_id, actor_id, type, wall_comment_id) values (new.profile_id, new.author_id, 'wall_comment', new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_wall_comment on public.wall_comments;
create trigger trg_notify_wall_comment after insert on public.wall_comments for each row execute function public.notify_wall_comment();
