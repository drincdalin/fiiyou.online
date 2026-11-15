-- 0040: the admin view of the moderation e-mail queue. Needs t.* helpers from 10_tests.sql.
do $$
declare admin_u uuid := gen_random_uuid(); member_u uuid := gen_random_uuid(); oid uuid; n int;
begin
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
    (admin_u,  'm40admin@t.t',  now(), '{"username":"m40admin","display_name":"A"}'),
    (member_u, 'm40member@t.t', now(), '{"username":"m40member","display_name":"M"}');
  insert into admin_emails (email) values ('m40admin@t.t');
  insert into moderation_outbox (kind, to_email, username, status, attempts, last_error)
    values ('content_removed', 'secret@example.com', 'someone', 'failed', 3, 'smtp timeout') returning id into oid;

  perform t.as_user(member_u);
  perform t.fails('select * from admin_outbox(10)', 'members cannot read the e-mail queue', 'forbidden');
  perform t.fails(format($q$select admin_requeue_email(%L)$q$, oid), 'members cannot requeue an e-mail', 'forbidden');

  perform t.as_user(admin_u);
  select count(*) into n from admin_outbox(10);
  perform t.ok(n >= 1, 'an admin sees the queue');
  perform t.ok(not exists (select 1 from information_schema.parameters
                           where specific_schema = 'public' and specific_name like 'admin_outbox%' and parameter_mode = 'OUT' and parameter_name in ('to_email', 'payload')),
               'the queue view never returns the recipient address or the payload');
  perform t.ok(admin_requeue_email(oid), 'an admin can put a failed e-mail back in the queue');
  perform t.ok((select status from admin_outbox(10) where id = oid) = 'pending', 'the requeued e-mail is pending again');
end $$;
