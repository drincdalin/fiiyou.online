-- =====================================================================
-- fiiyou 0036: every moderation removal tells the person WHY.   Run once in the Supabase SQL editor (after 0035).
--
--  * admin_delete_post(id, reason_code, reason_text)           -> deletes the post, emails the author the reason
--  * admin_delete_comment(type, id, reason_code, reason_text)  -> same for post comments and wall comments
--  * admin_ban_user(...)                                       -> the message to the person is now REQUIRED
--  * a removal is also written to deletion_log (who, why, a short label of what was removed)
--  * open reports on the removed item are closed automatically
--  * nobody is emailed about their own content being removed (a moderator deleting their own post)
--
-- The old one-argument versions are dropped on purpose: a removal without a reason must not be possible any more.
-- Admin.jsx has to send a reason (see admin.js: deletePost / deleteComment / CONTENT_REASONS).
-- =====================================================================

-- ---------- 1) the outbox accepts the new mail kinds; the log accepts the new reason codes ----------
alter table public.moderation_outbox drop constraint if exists moderation_outbox_kind_check;
alter table public.moderation_outbox add constraint moderation_outbox_kind_check
  check (kind in ('content_removed', 'account_banned', 'post_removed', 'comment_removed'));

alter table public.deletion_log drop constraint if exists deletion_log_reason_code_check;
alter table public.deletion_log add constraint deletion_log_reason_code_check
  check (reason_code in ('guidelines', 'inaccurate_location', 'spam', 'duplicate', 'custom', 'explicit', 'abuse'));

-- ---------- 2) two internal helpers (not callable from the app) ----------
-- validates a reason and returns the cleaned note (or null)
create or replace function public.mod_reason(p_code text, p_text text, p_allowed text[]) returns text
language plpgsql immutable set search_path = public as $$
declare v_note text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if p_code is null or not (p_code = any (p_allowed)) then raise exception 'bad_reason'; end if;
  if p_code = 'custom' and (v_note is null or char_length(v_note) < 5) then raise exception 'reason_required'; end if;
  if v_note is not null and char_length(v_note) > 300 then raise exception 'reason_too_long'; end if;
  return v_note;
end $$;

-- queues one email for a person; returns false when nobody should be mailed (no address, or it is the moderator's own content)
create or replace function public.queue_mod_mail(p_kind text, p_user uuid, p_payload jsonb) returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare v_email text; v_username text;
begin
  if p_user is null or p_user = auth.uid() then return false; end if;
  select email into v_email from auth.users where id = p_user;
  if v_email is null then return false; end if;
  select username into v_username from public.profiles where id = p_user;
  insert into public.moderation_outbox (kind, to_email, username, payload) values (p_kind, v_email, v_username, p_payload);
  return true;
end $$;

-- ---------- 3) delete a post with a reason ----------
drop function if exists public.admin_delete_post(uuid);
create function public.admin_delete_post(p_id uuid, p_reason_code text, p_reason_text text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_post public.posts; v_role text; v_note text; v_username text; v_closed int; v_notified boolean; v_paths jsonb;
begin
  perform public.assert_moderator();
  v_role := public.staff_role();
  v_note := public.mod_reason(p_reason_code, p_reason_text, array['guidelines', 'spam', 'explicit', 'abuse', 'custom']);

  select * into v_post from public.posts where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  select username into v_username from public.profiles where id = v_post.author_id;

  update public.reports set status = 'reviewed', resolved_by = auth.uid(), resolved_at = now(),
         resolution = left('Post removed (' || p_reason_code || ')', 300)
   where target_type = 'post' and target_id = p_id and status = 'open';
  get diagnostics v_closed = row_count;

  -- every file of the post (first photo + extra photos), for the app to remove from Storage afterwards
  v_paths := (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select v_post.image_path as x where v_post.image_path is not null
      union all
      select jsonb_array_elements_text(coalesce(to_jsonb(v_post.extra_images), '[]'::jsonb))) s);

  delete from public.posts where id = p_id;

  v_notified := public.queue_mod_mail('post_removed', v_post.author_id, jsonb_build_object(
    'content_type', 'post', 'title', v_post.title, 'excerpt', left(coalesce(v_post.body, ''), 300),
    'reason_code', p_reason_code, 'reason_text', v_note));

  insert into public.deletion_log (target_type, target_id, place_name, creator_id, creator_username, deleted_by, deleted_by_role,
                                   reason_code, reason_text, reports_closed, notified)
  values ('post', p_id, left(coalesce(nullif(v_post.title, ''), v_post.body, '(photo only)'), 80), v_post.author_id, v_username,
          auth.uid(), v_role, p_reason_code, v_note, v_closed, v_notified);   -- place_name holds a short label of what was removed

  perform public.log_admin('delete_post', p_id::text,
          jsonb_build_object('username', v_username, 'reason_code', p_reason_code, 'reports_closed', v_closed));
  return jsonb_build_object('paths', v_paths, 'closed_reports', v_closed, 'notified', v_notified);
end $$;

-- ---------- 4) delete a comment with a reason ----------
drop function if exists public.admin_delete_comment(text, uuid);
create function public.admin_delete_comment(p_type text, p_id uuid, p_reason_code text, p_reason_text text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_author uuid; v_body text; v_role text; v_note text; v_username text; v_closed int; v_notified boolean;
begin
  perform public.assert_moderator();
  v_role := public.staff_role();
  v_note := public.mod_reason(p_reason_code, p_reason_text, array['guidelines', 'spam', 'explicit', 'abuse', 'custom']);

  if p_type = 'post_comment' then
    select author_id, body into v_author, v_body from public.post_comments where id = p_id for update;
  elsif p_type = 'wall_comment' then
    select author_id, body into v_author, v_body from public.wall_comments where id = p_id for update;
  else raise exception 'bad_type'; end if;
  if not found then raise exception 'not_found'; end if;
  select username into v_username from public.profiles where id = v_author;

  update public.reports set status = 'reviewed', resolved_by = auth.uid(), resolved_at = now(),
         resolution = left('Comment removed (' || p_reason_code || ')', 300)
   where target_type = p_type and target_id = p_id and status = 'open';
  get diagnostics v_closed = row_count;

  if p_type = 'post_comment' then delete from public.post_comments where id = p_id;
  else delete from public.wall_comments where id = p_id; end if;

  v_notified := public.queue_mod_mail('comment_removed', v_author, jsonb_build_object(
    'content_type', p_type, 'excerpt', left(coalesce(v_body, ''), 300), 'reason_code', p_reason_code, 'reason_text', v_note));

  insert into public.deletion_log (target_type, target_id, place_name, creator_id, creator_username, deleted_by, deleted_by_role,
                                   reason_code, reason_text, reports_closed, notified)
  values (p_type, p_id, left(coalesce(v_body, ''), 80), v_author, v_username, auth.uid(), v_role, p_reason_code, v_note, v_closed, v_notified);

  perform public.log_admin('delete_' || p_type, p_id::text,
          jsonb_build_object('username', v_username, 'reason_code', p_reason_code, 'reports_closed', v_closed));
  return jsonb_build_object('closed_reports', v_closed, 'notified', v_notified);
end $$;

-- ---------- 5) bans: the message to the person is required ----------
create or replace function public.admin_ban_user(p_user uuid, p_reason text default null, p_user_message text default null) returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_email text; v_username text; v_msg text := nullif(btrim(coalesce(p_user_message, '')), '');
begin
  perform public.assert_admin();
  if p_user = auth.uid() then raise exception 'cannot_ban_self'; end if;
  if v_msg is null or char_length(v_msg) < 5 then raise exception 'reason_required'; end if;      -- the person must be told why
  if char_length(v_msg) > 500 then raise exception 'reason_too_long'; end if;
  select email into v_email from auth.users where id = p_user;
  if v_email is null then raise exception 'not_found'; end if;
  select username into v_username from public.profiles where id = p_user;
  insert into public.banned_emails (email_hash, reason, banned_by) values (public.email_fingerprint(v_email), p_reason, auth.uid())
    on conflict (email_hash) do nothing;
  insert into public.moderation_outbox (kind, to_email, username, payload)
    values ('account_banned', v_email, v_username, jsonb_build_object('reason_text', v_msg));
  perform public.log_admin('ban_user', p_user::text, jsonb_build_object('username', v_username, 'reason', p_reason));
  delete from auth.users where id = p_user;
end $$;

-- ---------- 6) grants ----------
revoke all on function public.mod_reason(text, text, text[]) from public, anon, authenticated;      -- internal helpers
revoke all on function public.queue_mod_mail(text, uuid, jsonb) from public, anon, authenticated;
do $$
declare s text;
begin
  foreach s in array array['public.admin_delete_post(uuid,text,text)', 'public.admin_delete_comment(text,uuid,text,text)', 'public.admin_ban_user(uuid,text,text)'] loop
    execute format('revoke all on function %s from public, anon', s);
    execute format('grant execute on function %s to authenticated', s);
  end loop;
end $$;
