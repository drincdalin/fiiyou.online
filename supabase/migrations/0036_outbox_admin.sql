-- Lets an administrator see which moderation emails were sent, failed or got stuck, and put a failed one back in the queue.
-- Never returns the recipient address (to_email) or the payload. Admin only (is_admin() is re-checked inside).

create or replace function public.admin_outbox(p_limit int default 50)
returns table (id uuid, kind text, username text, status text, attempts int, last_error text, created_at timestamptz, sent_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select o.id, o.kind::text, o.username::text, o.status::text, o.attempts::int, o.last_error::text, o.created_at, o.sent_at
    from public.moderation_outbox o
    order by o.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- A mail that failed or got stuck in 'sending' goes back to 'pending' with a fresh attempt counter.
-- Rows already sent (address erased) or without an address are left alone.
create or replace function public.admin_requeue_email(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.moderation_outbox
     set status = 'pending', attempts = 0
   where id = p_id and status in ('failed', 'sending') and to_email is not null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke all on function public.admin_outbox(int) from public, anon;
revoke all on function public.admin_requeue_email(uuid) from public, anon;
grant execute on function public.admin_outbox(int) to authenticated;
grant execute on function public.admin_requeue_email(uuid) to authenticated;

notify pgrst, 'reload schema';
