-- 0029: global search, several images per post, scheduled posts, pinned messages, message search.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
        pa uuid; pf uuid; m1 uuid; m2 uuid; n int; ok boolean;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'sa@t.t', '{"username":"s29a","display_name":"S A"}'), (b, 's29b@t.t', '{"username":"s29b","display_name":"S B"}'),
    (c, 's29c@t.t', '{"username":"s29c","display_name":"S C"}');
  update auth.users set created_at = now() - interval '30 days' where id in (a, b, c);   -- not "new accounts" for the spam guard
  insert into public.friendships (requester_id, addressee_id, status) values (a, b, 'accepted');

  -- search_post_ids: diacritics, literal wildcards, public only
  insert into public.posts (author_id, kind, body, visibility) values
    (a, 'status', 'Târgul Binșului e sâmbătă #targ29', 'public'), (a, 'status', 'secret targul only friends', 'friends'),
    (a, 'status', '100% sigur', 'public');
  update public.posts set created_at = created_at - interval '3 hours' where author_id = a;   -- keep the per-minute spam limit out of the way
  perform t.as_user(c);
  select count(*) into n from public.search_post_ids('targul binsului'); perform t.ok(n = 1, 'post search ignores diacritics (got ' || n || ')');
  select count(*) into n from public.search_post_ids('secret'); perform t.ok(n = 0, 'friends-only posts are never searchable');
  select count(*) into n from public.search_post_ids('%%'); perform t.ok(n = 0, 'bare wildcard matches nothing');
  select count(*) into n from public.search_post_ids('100%'); perform t.ok(n = 1, 'percent sign matches literally');
  select count(*) into n from public.search_tags('#targ'); perform t.ok(n = 1, 'tag search finds the tag by prefix');

  -- several images per post
  perform t.as_user(a);
  insert into public.posts (author_id, kind, body, image_path, extra_images, visibility)
    values (a, 'status', 'album', a || '/i1.webp', array[a || '/i2.webp', a || '/i3.webp'], 'friends') returning id into pf;
  perform t.ok((select cardinality(extra_images) from public.get_post(pf)) = 2, 'get_post returns extra_images');
  perform t.ok((select cardinality(extra_images) from public.local_feed() where id = pf) = 2, 'local_feed returns extra_images');
  perform t.as_admin(); update public.posts set created_at = created_at - interval '3 hours' where author_id = a; perform t.as_user(a);
  begin insert into public.posts (author_id, kind, body, image_path, extra_images) values (a, 'status', 'x', a || '/1.webp', array[a||'/2.webp',a||'/3.webp',a||'/4.webp',a||'/5.webp']); ok := false;
  exception when check_violation then ok := true; when others then ok := false; end; perform t.ok(ok, 'more than 3 extra images is refused');
  begin insert into public.posts (author_id, kind, body, extra_images) values (a, 'status', 'x', array[a||'/2.webp']); ok := false;
  exception when check_violation then ok := true; when others then ok := false; end; perform t.ok(ok, 'extra images need a first image');
  perform t.as_admin();
  insert into storage.objects (bucket_id, name) values ('media', a || '/i1.webp'), ('media', a || '/i2.webp'), ('media', a || '/i3.webp');
  perform t.as_user(c);
  perform t.ok((select count(*) from storage.objects where bucket_id = 'media' and name like a || '/i%') = 0, 'stranger cannot read ANY image of a friends-only album');
  perform t.as_user(b);
  perform t.ok((select count(*) from storage.objects where bucket_id = 'media' and name like a || '/i%') = 3, 'friend reads all album images');

  -- scheduled posts
  perform t.as_user(a);
  insert into public.scheduled_posts (author_id, kind, body, publish_at) values (a, 'status', 'later29', now() + interval '1 hour');
  perform t.ok((select count(*) from public.scheduled_posts) >= 1, 'author sees own scheduled post');
  perform t.ok(not exists (select 1 from public.local_feed() where body = 'later29'), 'scheduled post is not in the feed yet');
  perform t.as_user(c);
  perform t.ok((select count(*) from public.scheduled_posts) = 0, 'others cannot see scheduled posts');
  perform t.as_admin();
  update public.scheduled_posts set publish_at = now() - interval '1 minute' where body = 'later29';   -- time passes
  perform t.as_user(c);
  perform t.ok(public.publish_due_posts() >= 1, 'publish_due_posts publishes due posts');
  perform t.ok(exists (select 1 from public.local_feed() where body = 'later29'), 'published post shows up in the feed');
  perform t.ok(not exists (select 1 from public.scheduled_posts where body = 'later29'), 'published post leaves the queue');
  perform t.ok(public.publish_due_posts() = 0, 'nothing is published twice');
  perform t.as_user(a);
  begin insert into public.scheduled_posts (author_id, kind, body, publish_at) values (b, 'status', 'forged', now() + interval '1 hour'); ok := false;
  exception when others then ok := true; end; perform t.ok(ok, 'cannot schedule a post as someone else');

  -- pins and message search
  perform t.as_admin();
  insert into public.messages (sender_id, recipient_id, body) values (a, b, 'Ne vedem la Târg mâine') returning id into m1;
  insert into public.messages (sender_id, recipient_id, body) values (b, a, 'fiiyou:post:{"x":1} targ') returning id into m2;
  perform t.as_user(a);
  select count(*) into n from public.search_messages('targ'); perform t.ok(n = 1, 'message search finds text, skips shared-post cards (got ' || n || ')');
  perform t.as_user(c);
  select count(*) into n from public.search_messages('targ'); perform t.ok(n = 0, 'message search never shows other people''s chats');
  begin insert into public.message_pins (user_id, message_id, peer_id) values (c, m1, a); ok := false;
  exception when others then ok := true; end; perform t.ok(ok, 'cannot pin a message from a chat I am not in');
  perform t.as_user(b);
  insert into public.message_pins (user_id, message_id, peer_id) values (b, m1, a);
  perform t.ok((select count(*) from public.message_pins) = 1, 'pin saved');
  perform t.as_user(a);
  perform t.ok((select count(*) from public.message_pins) = 0, 'pins are private to the person who pinned');
  perform t.as_admin();
end $$;
