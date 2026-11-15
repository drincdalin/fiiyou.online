-- 0041: my_posts and my_post_stats. Needs t.* helpers from 10_tests.sql.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); p1 uuid; p2 uuid; p3 uuid; n int; first_at timestamptz;
begin
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
    (a, 'm41a@t.t', now(), '{"username":"m41alice","display_name":"A"}'),
    (b, 'm41b@t.t', now(), '{"username":"m41bob","display_name":"B"}');
  insert into posts (author_id, kind, body, visibility, created_at) values (a, 'status', 'hello world', 'public', now() - interval '3 hours') returning id into p1;
  insert into posts (author_id, kind, title, body, event_at, visibility, created_at) values (a, 'event', 'Picnic', 'bring snacks', now() + interval '2 days', 'friends', now() - interval '2 hours') returning id into p2;
  insert into posts (author_id, kind, body, visibility, created_at) values (a, 'ask', 'anyone seen a ZEBRA?', 'public', now() - interval '1 hour') returning id into p3;
  insert into posts (author_id, kind, body, visibility) values (b, 'status', 'bob only', 'public');
  insert into post_likes (post_id, user_id) values (p1, b), (p3, b);
  insert into post_comments (post_id, author_id, body) values (p1, b, 'nice'), (p1, b, 'really nice');

  perform t.as_user(a);
  select count(*) into n from my_posts();                                     perform t.ok(n = 3, 'you see exactly your own posts (not Bob''s)');
  select created_at into first_at from my_posts() limit 1;                    perform t.ok(first_at > now() - interval '70 minutes', 'newest first');
  select count(*) into n from my_posts(p_kind => 'event');                    perform t.ok(n = 1, 'filter by kind');
  select count(*) into n from my_posts(p_visibility => 'friends');            perform t.ok(n = 1, 'filter by who can see it');
  select count(*) into n from my_posts(p_q => '  zebra ');                    perform t.ok(n = 1, 'search is case-insensitive and trims spaces');
  select count(*) into n from my_posts(p_q => 'picnic');                      perform t.ok(n = 1, 'search also reads an event title');
  select count(*) into n from my_posts(p_q => '%');                           perform t.ok(n = 0, 'a % in the search is a plain character, not a wildcard');
  select count(*) into n from my_posts(p_before => now() - interval '90 minutes', p_limit => 1);   perform t.ok(n = 1, 'paging: before + limit');
  select like_count into n from my_posts() where id = p1;                     perform t.ok(n = 1, 'like count is returned');
  select comment_count into n from my_posts() where id = p1;                  perform t.ok(n = 2, 'comment count is returned');
  select posts into n from my_post_stats();                                   perform t.ok(n = 3, 'stats: posts');
  select events into n from my_post_stats();                                  perform t.ok(n = 1, 'stats: events');
  select friends_only into n from my_post_stats();                            perform t.ok(n = 1, 'stats: friends only');
  select likes into n from my_post_stats();                                   perform t.ok(n = 2, 'stats: likes');
  select comments into n from my_post_stats();                                perform t.ok(n = 2, 'stats: comments');

  perform t.as_user(b);
  select count(*) into n from my_posts();                                     perform t.ok(n = 1, 'Bob sees only his own post');
  reset role;
  set local role anon;
  perform t.fails('select * from my_posts()', 'signed-out visitors cannot call my_posts', 'permission denied');
  perform t.fails('select * from my_post_stats()', 'signed-out visitors cannot call my_post_stats', 'permission denied');
  reset role;
end $$;
