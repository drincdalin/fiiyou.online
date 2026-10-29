-- 0028_comment_likes_replies_mentions.sql
-- Comment likes, replies (one level deep), @mentions in posts and comments, and the notifications for all of it.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- =====================================================================================
-- 1. Replies. parent_id = the top-level comment of the thread, reply_to = the comment that was actually answered.
--    The client sends parent_id = the comment the person clicked "Reply" on; this trigger flattens it so threads stay one level deep.
-- =====================================================================================
alter table public.post_comments add column if not exists parent_id uuid references public.post_comments(id) on delete cascade;
alter table public.post_comments add column if not exists reply_to  uuid references public.post_comments(id) on delete set null;
create index if not exists post_comments_parent_idx on public.post_comments(parent_id);

create or replace function public.comment_flatten_parent() returns trigger
language plpgsql security definer set search_path = public as $$
declare pp record;
begin
  new.reply_to := null;
  if new.parent_id is null then return new; end if;
  select post_id, parent_id into pp from public.post_comments where id = new.parent_id;
  if not found or pp.post_id <> new.post_id then raise exception 'bad_parent'; end if;
  new.reply_to := new.parent_id;
  if pp.parent_id is not null then new.parent_id := pp.parent_id; end if;   -- replying to a reply: attach to the thread root
  return new;
end $$;

drop trigger if exists post_comments_flatten on public.post_comments;
create trigger post_comments_flatten before insert on public.post_comments
  for each row execute function public.comment_flatten_parent();

-- =====================================================================================
-- 2. Comment likes. Visibility follows post_comments (the subquery in each policy runs under the caller's RLS).
-- =====================================================================================
create table if not exists public.comment_likes (
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id)      on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.comment_likes enable row level security;
grant select, insert, delete on public.comment_likes to authenticated;

drop policy if exists comment_likes_select on public.comment_likes;
create policy comment_likes_select on public.comment_likes for select to authenticated
  using (exists (select 1 from public.post_comments c where c.id = comment_id));
drop policy if exists comment_likes_insert on public.comment_likes;
create policy comment_likes_insert on public.comment_likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.post_comments c where c.id = comment_id));
drop policy if exists comment_likes_delete on public.comment_likes;
create policy comment_likes_delete on public.comment_likes for delete to authenticated
  using (user_id = auth.uid());

-- Like counts + "did I like it" for every comment of one post, in a single round trip.
create or replace function public.comment_likes_for(p_post uuid)
returns table (comment_id uuid, like_count bigint, liked boolean)
language sql stable security invoker set search_path = public as $$
  select l.comment_id, count(*)::bigint, coalesce(bool_or(l.user_id = auth.uid()), false)
  from public.comment_likes l join public.post_comments c on c.id = l.comment_id
  where c.post_id = p_post group by l.comment_id
$$;
grant execute on function public.comment_likes_for(uuid) to authenticated;

-- =====================================================================================
-- 3. Notifications: new columns / types.
--    If notifications.type is a Postgres ENUM instead of text, use  ALTER TYPE ... ADD VALUE  for the four new values instead.
-- =====================================================================================
alter table public.notifications add column if not exists comment_id uuid references public.post_comments(id) on delete cascade;
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in
  ('post_like','photo_like','comment','wall_comment','friend_request','friend_accept',
   'comment_like','reply','mention','comment_mention')) not valid;

-- Internal helper: one notification, never to myself, never a duplicate of one that is still unread.
create or replace function public._notify(p_user uuid, p_actor uuid, p_type text, p_post uuid, p_comment uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  if exists (select 1 from public.notifications n where n.user_id = p_user and n.actor_id = p_actor and n.type = p_type
             and n.read = false and n.post_id is not distinct from p_post and n.comment_id is not distinct from p_comment) then return; end if;
  insert into public.notifications (user_id, actor_id, type, post_id, comment_id) values (p_user, p_actor, p_type, p_post, p_comment);
end $$;
revoke all on function public._notify(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;

-- =====================================================================================
-- 4. Mentions. "@username" (letters, digits, underscore), at most 10 people per text.
-- =====================================================================================
create or replace function public.mentioned_users(p_body text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p.id), '{}')
  from (select distinct lower(m[1]) as u
        from regexp_matches(coalesce(p_body, ''), '(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_]{2,30})', 'g') as m limit 10) t
  join public.profiles p on lower(p.username) = t.u
$$;
revoke all on function public.mentioned_users(text) from public, anon, authenticated;

-- Who may be told about a post? Public posts: everyone. Friends-only posts: CONSERVATIVE DEFAULT = only the author.
-- TODO: replace the last line with your own friendship check, e.g.  or exists (select 1 from friendships f where ...)
create or replace function public._can_see_post(p_post uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.posts p where p.id = p_post
    and (p.visibility <> 'friends' or p.author_id = p_user /* or <friends check here> */))
$$;
revoke all on function public._can_see_post(uuid, uuid) from public, anon, authenticated;

-- 4a. Mentions in a post (on insert, and on edit only for people who were not mentioned before).
create or replace function public.trg_post_mentions() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid; before_set uuid[] := '{}';
begin
  if tg_op = 'UPDATE' then before_set := public.mentioned_users(old.body); end if;
  foreach u in array public.mentioned_users(new.body) loop
    if u = any(before_set) then continue; end if;
    if public._can_see_post(new.id, u) then perform public._notify(u, new.author_id, 'mention', new.id, null); end if;
  end loop;
  return null;
end $$;
drop trigger if exists posts_mentions_ins on public.posts;
create trigger posts_mentions_ins after insert on public.posts for each row execute function public.trg_post_mentions();
drop trigger if exists posts_mentions_upd on public.posts;
create trigger posts_mentions_upd after update of body on public.posts for each row
  when (old.body is distinct from new.body) execute function public.trg_post_mentions();

-- 4b. A new comment: tell the person who was replied to, and anyone mentioned.
--     The post's author already gets 'comment' from the 0020 trigger, and nobody gets two notifications for one comment.
create or replace function public.trg_comment_extras() returns trigger
language plpgsql security definer set search_path = public as $$
declare post_author uuid; target uuid; u uuid; done uuid[];
begin
  select author_id into post_author from public.posts where id = new.post_id;
  done := array[post_author, new.author_id];
  if new.reply_to is not null then
    select author_id into target from public.post_comments where id = new.reply_to;
    if target is not null and not (target = any(done)) then
      perform public._notify(target, new.author_id, 'reply', new.post_id, new.id);
      done := done || target;
    end if;
  end if;
  foreach u in array public.mentioned_users(new.body) loop
    if u = any(done) then continue; end if;
    if public._can_see_post(new.post_id, u) then
      perform public._notify(u, new.author_id, 'comment_mention', new.post_id, new.id);
      done := done || u;
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists post_comments_extras on public.post_comments;
create trigger post_comments_extras after insert on public.post_comments
  for each row execute function public.trg_comment_extras();

-- 4c. Someone liked my comment.
create or replace function public.trg_comment_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select author_id, post_id into c from public.post_comments where id = new.comment_id;
  perform public._notify(c.author_id, new.user_id, 'comment_like', c.post_id, new.comment_id);
  return null;
end $$;
drop trigger if exists comment_likes_notify on public.comment_likes;
create trigger comment_likes_notify after insert on public.comment_likes
  for each row execute function public.trg_comment_like();
