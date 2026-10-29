-- 0027_message_edit_delete.sql
-- Edit and delete your own chat messages.
-- Delete is a soft delete: the text is replaced by a fixed marker, so replies that quote the message keep working and
-- nothing depends on the foreign key of messages.reply_to. The app shows the marker as "This message was deleted".
-- Keep the marker equal to DELETED_BODY in social.js.

alter table public.messages add column if not exists edited_at timestamptz;

create or replace function public.edit_message(p_id uuid, p_body text) returns public.messages
language plpgsql security definer set search_path = public as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  r public.messages;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(v_body) not between 1 and 1000 then raise exception 'invalid_body'; end if;

  update public.messages
     set body = v_body, edited_at = now()
   where id = p_id and sender_id = auth.uid()
     and body <> '[message deleted]' and body <> v_body
  returning * into r;

  if r.id is null then   -- unchanged text is fine; anything else is not yours / not found / deleted
    select * into r from public.messages
     where id = p_id and sender_id = auth.uid() and body <> '[message deleted]';
    if r.id is null then raise exception 'not_found'; end if;
  end if;
  return r;
end $$;

create or replace function public.delete_message(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.messages
     set body = '[message deleted]', edited_at = null
   where id = p_id and sender_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
end $$;

revoke all on function public.edit_message(uuid, text) from public;
revoke all on function public.delete_message(uuid) from public;
grant execute on function public.edit_message(uuid, text) to authenticated;
grant execute on function public.delete_message(uuid) to authenticated;
