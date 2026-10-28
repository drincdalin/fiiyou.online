-- 0023: who may read files in the 'media' bucket (can_read_media + the media_read policy).
-- Runs after 10_tests.sql (uses its helpers t.as_user / t.as_admin / t.ok).
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid(); n int;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'ma@t.t', '{"username":"mediaa","display_name":"A"}'), (b, 'mb@t.t', '{"username":"mediab","display_name":"B"}'),
    (c, 'mc@t.t', '{"username":"mediac","display_name":"C"}'), (d, 'md@t.t', '{"username":"mediad","display_name":"D"}');
  -- a and b are friends; c is a stranger; d blocked a
  insert into public.friendships (requester_id, addressee_id, status) values (a, b, 'accepted');
  insert into public.blocks (blocker_id, blocked_id) values (d, a);
  insert into public.posts (author_id, kind, body, image_path, visibility) values
    (a, 'status', 'friends only', a || '/friends.webp', 'friends'),
    (a, 'status', 'public', a || '/public.webp', 'public');
  insert into storage.objects (bucket_id, name) values
    ('media', a || '/friends.webp'), ('media', a || '/public.webp'), ('media', a || '/avatar.webp'), ('media', c || '/c.webp');

  perform t.as_user(a);  perform t.ok((select count(*) from storage.objects where bucket_id = 'media' and name like a || '/%') = 3, 'owner reads all own files');
  perform t.as_user(b);  perform t.ok((select count(*) from storage.objects where bucket_id = 'media' and name like a || '/%') = 3, 'friend reads friends-only post image');
  perform t.as_user(c);  perform t.ok((select count(*) from storage.objects where bucket_id = 'media' and name = a || '/friends.webp') = 0, 'stranger cannot read friends-only post image');
  perform t.ok((select count(*) from storage.objects where bucket_id = 'media' and name in (a || '/public.webp', a || '/avatar.webp')) = 2, 'stranger still reads public post image and avatar');
  perform t.as_user(d);  perform t.ok((select count(*) from storage.objects where bucket_id = 'media' and name like a || '/%') = 0, 'blocker cannot read the blocked person''s files');
  perform t.as_user(a);  perform t.ok((select count(*) from storage.objects where bucket_id = 'media' and name like c || '/%') = 1, 'unblocked files stay readable');
  perform t.as_user(a);  perform t.ok(not exists (select 1 from storage.objects where bucket_id = 'media' and name like d || '/%'), 'sanity: no files for d');
  perform t.as_admin();
end $$;
