-- 0057: deleting an account (without banning it) now needs a reason, and the person is emailed that reason, exactly like a ban.
--
--  * admin_delete_user(p_user, p_user_message)  -> the message is REQUIRED (5-500 characters), is queued as an 'account_deleted' email, then the account is deleted
--  * the old one-argument admin_delete_user(uuid) is dropped on purpose: a deletion without a reason must not be possible any more
--  * the outbox accepts the new mail kind 'account_deleted'
--  * unlike a ban, the email address is NOT blocked: the person may register again
--
-- Run this BEFORE deploying the new front end (the new Admin screen calls the two-argument version), and deploy the updated
-- send-moderation-email function (index.ts + templates.ts) so the new mail kind can be rendered. Until the function is updated a queued
-- 'account_deleted' mail stays "failed: unknown kind" in the Emails tab and can be re-queued once the function is deployed.

alter table public.moderation_outbox drop constraint if exists moderation_outbox_kind_check;
alter table public.moderation_outbox add constraint moderation_outbox_kind_check
  check (kind in ('content_removed', 'account_banned', 'post_removed', 'comment_removed', 'account_deleted'));

drop function if exists public.admin_delete_user(uuid);
create function public.admin_delete_user(p_user uuid, p_user_message text default null) returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_email text; v_username text; v_msg text := nullif(btrim(coalesce(p_user_message, '')), '');
begin
  perform public.assert_admin();
  if p_user = auth.uid() then raise exception 'cannot_delete_self'; end if;
  if v_msg is null or char_length(v_msg) < 5 then raise exception 'reason_required'; end if;      -- the person must be told why
  if char_length(v_msg) > 500 then raise exception 'reason_too_long'; end if;
  select email into v_email from auth.users where id = p_user;
  if v_email is null then raise exception 'not_found'; end if;
  select username into v_username from public.profiles where id = p_user;
  insert into public.moderation_outbox (kind, to_email, username, payload)
    values ('account_deleted', v_email, v_username, jsonb_build_object('reason_text', v_msg));
  perform public.log_admin('delete_user', p_user::text, jsonb_build_object('username', v_username));
  delete from auth.users where id = p_user;
end $$;

revoke all on function public.admin_delete_user(uuid, text) from public, anon;
grant execute on function public.admin_delete_user(uuid, text) to authenticated;
