-- 0034: likes on chat messages
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); m1 uuid; ids uuid[]; i int; ok boolean; n int;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'ml_a@t.t', '{"username":"mla","display_name":"ML A"}'), (b, 'ml_b@t.t', '{"username":"mlb","display_name":"ML B"}'), (c, 'ml_c@t.t', '{"username":"mlc","display_name":"ML C"}');
  update auth.users set created_at = now() - interval '30 days' where id in (a, b, c);
  perform t.as_admin();
  insert into public.messages (sender_id, recipient_id, body) values (b, a, 'hello a') returning id into m1;
  set local session_replication_role = replica;
  insert into public.messages (sender_id, recipient_id, body, created_at) select b, a, 'bulk ' || g, now() - interval '2 days' - (g || ' minutes')::interval from generate_series(1, 160) g;
  set local session_replication_role = origin;

  perform t.as_user(a);
  insert into public.message_likes (message_id, user_id) values (m1, a);
  perform t.ok((select count(*) from public.message_likes where message_id = m1) = 1, 'the person who got the message can like it');
  perform t.as_user(b);
  insert into public.message_likes (message_id, user_id) values (m1, b);
  perform t.ok((select count(*) from public.message_likes where message_id = m1) = 2, 'the sender can like it too and sees both hearts');
  begin insert into public.message_likes (message_id, user_id) values (m1, b); ok := false; exception when unique_violation then ok := true; end;
  perform t.ok(ok, 'the same person cannot like a message twice');
  begin insert into public.message_likes (message_id, user_id) values (m1, a); ok := false; exception when others then ok := true; end;
  perform t.ok(ok, 'nobody can add a like in someone else''s name');

  perform t.as_user(c);
  perform t.ok((select count(*) from public.message_likes where message_id = m1) = 0, 'an outsider sees none of the likes');
  begin insert into public.message_likes (message_id, user_id) values (m1, c); ok := false; exception when others then ok := true; end;
  perform t.ok(ok, 'an outsider cannot like a message in someone else''s chat');
  delete from public.message_likes where message_id = m1;
  perform t.as_admin();
  perform t.ok((select count(*) from public.message_likes where message_id = m1) = 2, 'an outsider cannot remove likes');

  perform t.as_user(a);
  delete from public.message_likes where message_id = m1 and user_id = b;
  perform t.ok((select count(*) from public.message_likes where message_id = m1 and user_id = b) = 1, 'you cannot remove the other person''s like');
  delete from public.message_likes where message_id = m1 and user_id = a;
  perform t.ok((select count(*) from public.message_likes where message_id = m1 and user_id = a) = 0, 'you can remove your own like');

  perform t.as_admin();
  select array_agg(id order by created_at) into ids from public.messages where recipient_id = a and body like 'bulk %';
  perform t.as_user(a);
  for i in 1..150 loop insert into public.message_likes (message_id, user_id) values (ids[i], a); end loop;
  begin insert into public.message_likes (message_id, user_id) values (ids[151], a); ok := false; exception when others then ok := sqlerrm = 'rate_limit'; end;
  perform t.ok(ok, 'the 151st like in an hour is refused with rate_limit');

  perform t.as_admin();
  perform t.ok(not has_table_privilege('anon', 'public.message_likes', 'select'), 'the public key cannot read message likes');
end $$;
