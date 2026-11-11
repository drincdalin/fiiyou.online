-- 0035: moderator role, place deletion with reasons, categorised reports, ban notification. Needs t.* helpers from 10_tests.sql.
do $$
declare admin_u uuid := gen_random_uuid(); mod_u uuid := gen_random_uuid(); creator uuid := gen_random_uuid(); other uuid := gen_random_uuid();
        p1 uuid; p2 uuid; p3 uuid; r jsonb; n int;
begin
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
    (admin_u, 'm35admin@t.t', now(), '{"username":"m35admin","display_name":"A"}'),
    (mod_u,   'm35mod@t.t',   now(), '{"username":"m35mod","display_name":"M"}'),
    (creator, 'm35creator@t.t', now(), '{"username":"m35creator","display_name":"C"}'),
    (other,   'm35other@t.t', now(), '{"username":"m35other","display_name":"O"}');
  update auth.users set created_at = now() - interval '30 days';
  perform t.as_admin();
  insert into admin_emails (email) values ('m35admin@t.t');
  insert into staff_roles (user_id, role) values (mod_u, 'moderator');
  insert into places (name, lat, lng, created_by) values ('Spam Cafe', 46.9, 22.3, creator) returning id into p1;
  insert into places (name, lat, lng, created_by) values ('Dup Park', 46.91, 22.31, creator) returning id into p2;
  insert into places (name, lat, lng, created_by) values ('Mod Own', 46.92, 22.32, mod_u) returning id into p3;

  -- roles
  perform t.as_user(mod_u);   perform t.ok(staff_role() = 'moderator' and not is_admin(), 'moderator is a moderator, not an admin');
  perform t.as_user(admin_u); perform t.ok(staff_role() = 'admin', 'admin is admin');
  perform t.as_user(other);   perform t.ok(staff_role() is null, 'regular member has no staff role');
  perform t.ok(not has_table_privilege('authenticated', 'public.staff_roles', 'select'), 'staff_roles is invisible to members');
  perform t.fails(format($q$insert into staff_roles (user_id, role) values (%L, 'moderator')$q$, other), 'members cannot promote themselves');
  perform t.fails(format($q$select admin_set_moderator(%L, true)$q$, other), 'members cannot grant moderator', 'forbidden');
  perform t.as_user(mod_u);
  perform t.fails(format($q$select admin_set_moderator(%L, true)$q$, other), 'moderators cannot grant moderator', 'forbidden');
  perform t.fails(format($q$select admin_ban_user(%L, 'x', 'y')$q$, other), 'moderators cannot ban', 'forbidden');
  perform t.fails('select admin_stats()', 'moderators cannot read admin stats', 'forbidden');

  -- standard users: own places only
  perform t.as_user(other);
  perform t.affects_none(format($q$delete from places where id = %L$q$, p1), 'a member cannot delete someone else''s place directly');
  perform t.fails(format($q$select admin_delete_place(%L, 'spam', null)$q$, p1), 'a member cannot call admin_delete_place', 'forbidden');
  perform t.as_user(creator);
  perform t.fails(format($q$select submit_report('place', %L, 'spam', null)$q$, p1), 'cannot report your own place', 'cannot_report_own');

  -- reporting
  perform t.as_user(other);
  perform submit_report('place', p1, 'spam', 'ads for a shop');
  perform t.fails(format($q$select submit_report('place', %L, 'spam', null)$q$, p1), 'a second open report on the same place is refused', '');
  perform t.fails(format($q$select submit_report('place', %L, 'other', null)$q$, p2), 'category "other" needs details', 'details_required');
  perform t.fails(format($q$select submit_report('place', %L, 'nonsense', null)$q$, p2), 'unknown category refused', 'bad_category');
  perform t.fails(format($q$select submit_report('place', %L, 'spam', null)$q$, gen_random_uuid()), 'reporting a missing place refused', 'not_found');

  -- moderator workflow
  perform t.as_user(mod_u);
  perform t.ok((select count(*) from admin_reports('open') where target_type = 'place') = 1, 'moderator sees the open place report');
  perform t.ok((select preview->>'title' from admin_reports('open') where target_type = 'place') = 'Spam Cafe', 'place preview carries the name');
  perform t.fails(format($q$select admin_delete_place(%L, 'custom', '  ')$q$, p1), 'custom reason must be written', 'reason_required');
  perform t.fails(format($q$select admin_delete_place(%L, 'because', null)$q$, p1), 'unknown reason code refused', 'bad_reason');
  r := admin_delete_place(p1, 'spam', null);
  perform t.ok((r->>'closed_reports')::int = 1 and (r->>'notified')::boolean, 'delete closes the report and queues the email');
  perform t.ok(not exists (select 1 from places where id = p1), 'moderator deleted a place they did not create');
  perform t.ok((select status from admin_reports('reviewed') where target_id = p1) = 'reviewed', 'the report is now resolved');
  perform admin_delete_place(p3, 'duplicate', null);
  perform t.as_admin();
  perform t.ok((select count(*) from deletion_log where target_id = p1 and reason_code = 'spam' and creator_username = 'm35creator' and deleted_by_role = 'moderator') = 1, 'deletion_log keeps a snapshot, the reason and the creator');
  perform t.ok((select count(*) from moderation_outbox where kind = 'content_removed' and to_email = 'm35creator@t.t' and payload->>'place_name' = 'Spam Cafe') = 1, 'creator email queued');
  perform t.ok((select count(*) from moderation_outbox where payload->>'place_name' = 'Mod Own') = 0, 'no email when a moderator removes their own place');
  perform t.ok((select count(*) from admin_actions where action = 'delete_place') = 2, 'both deletions are in the audit log');

  -- clients can never read the outbox or the log tables
  perform t.as_user(other);
  perform t.ok(not has_table_privilege('authenticated', 'public.moderation_outbox', 'select') and not has_table_privilege('authenticated', 'public.deletion_log', 'select'), 'outbox and deletion_log are closed to clients');
  perform t.ok(not has_function_privilege('anon', 'public.admin_delete_place(uuid,text,text)', 'execute'), 'admin_delete_place is not callable by the public key');

  -- ban queues the email before the account (and its address) is gone
  perform t.as_user(admin_u);
  perform admin_ban_user(other, 'internal note', 'Harassment of other members');
  perform t.as_admin();
  perform t.ok(not exists (select 1 from auth.users where id = other), 'banned account is deleted');
  perform t.ok((select count(*) from moderation_outbox where kind = 'account_banned' and to_email = 'm35other@t.t' and payload->>'reason_text' = 'Harassment of other members') = 1, 'ban email queued with the user-facing reason');
  perform t.ok((select count(*) from banned_emails) >= 1, 'email fingerprint stored');
end $$;
