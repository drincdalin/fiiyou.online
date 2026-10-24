-- Behavioural tests: RLS, friend flow, blocks, validators, rate limits.
-- Impersonation: t.as_user(uuid) sets the JWT sub + switches to role authenticated.
create schema if not exists t;
grant usage on schema t to authenticated, anon;

create function t.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  execute 'set local role authenticated';
end $$;
create function t.as_admin() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
create function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', msg; end if;
  raise notice 'pass: %', msg;
end $$;
-- run sql, expect it to raise (any error) or, if rows-affected mode, to affect 0 rows
create function t.fails(q text, msg text, expect text default null) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if expect is not null and sqlerrm not ilike '%' || expect || '%' then
      raise exception 'FAIL: % (wrong error: %)', msg, sqlerrm;
    end if;
    raise notice 'pass: % (%)', msg, sqlerrm; return; end;
  raise exception 'FAIL: % (statement succeeded)', msg;
end $$;
create function t.affects_none(q text, msg text) returns void language plpgsql as $$
declare n int;
begin
  execute q; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: % (affected % rows)', msg, n; end if;
  raise notice 'pass: %', msg;
end $$;

do $$
declare
  alice uuid := '00000000-0000-0000-0000-00000000000a';
  bob   uuid := '00000000-0000-0000-0000-00000000000b';
  carol uuid := '00000000-0000-0000-0000-00000000000c';
  fid uuid; n int; pid uuid; cid uuid;
begin
  -- ---- signup trigger ----
  insert into auth.users (id, raw_user_meta_data) values
    (alice, '{"username":"Alice_B","display_name":"Alice"}'),
    (bob,   '{"username":"bob"}'),
    (carol, '{"username":"x"}');            -- invalid username -> fallback
  perform t.ok((select username from profiles where id = alice) = 'alice_b', 'username lowercased on signup');
  perform t.ok((select username from profiles where id = carol) like 'user\_%', 'invalid username falls back');
  perform t.ok((select count(*) from profile_cards where profile_id = alice) = 4, 'starter cards created');
  perform t.ok(public.username_available('bob') = false and public.username_available('zed_1') = true, 'username_available');

  -- ---- profile RLS + theme validation ----
  perform t.as_user(alice);
  update profiles set theme = '{"bg_color":"#ff00aa","font":"pixel","cursor":"crosshair"}' where id = alice;
  perform t.ok((select theme->>'font' from profiles where id = alice) = 'pixel', 'valid theme saved');
  update profiles set theme = '{"font":"endless","name_font":"endless","card_color":"#141414","radius":"8","overlay":"60"}' where id = alice;
  perform t.ok((select theme->>'radius' from profiles where id = alice) = '8', 'theme v2 keys saved');
  perform t.fails($q$update profiles set theme = '{"radius":"999"}' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'bad radius rejected', 'check constraint');
  perform t.fails($q$update profiles set theme = '{"bg_color":"red"}' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'named color rejected', 'check constraint');
  perform t.fails($q$update profiles set theme = '{"css":"body{display:none}"}' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'unknown theme key rejected', 'check constraint');
  perform t.fails($q$update profiles set theme = '{"bg_image":"../../etc/passwd"}' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'bad bg_image path rejected', 'check constraint');
  perform t.affects_none(format($q$update profiles set bio = 'hacked' where id = %L$q$, bob), 'cannot edit other profile');
  perform t.fails(format($q$insert into profiles (id, username, display_name) values (gen_random_uuid(),'evil','Evil')$q$), 'cannot insert profile directly');

  -- ---- cards ----
  perform t.fails($q$insert into profile_cards (profile_id, type, content) values ('00000000-0000-0000-0000-00000000000a','links','{"links":[{"url":"javascript:alert(1)","label":"x"}]}')$q$, 'javascript: link rejected', 'check constraint');
  insert into profile_cards (profile_id, type, title, content, style, rotation)
    values (alice, 'links', 'Links', '{"links":[{"url":"https://optimeal.site","label":"opt"}]}', '{"border_style":"dashed","border_width":3,"shadow":true}', -7.5);
  perform t.fails($q$insert into profile_cards (profile_id, type, style) values ('00000000-0000-0000-0000-00000000000a','text','{"border_width":99}')$q$, 'border_width out of range rejected', 'check constraint');
  perform t.fails($q$insert into profile_cards (profile_id, type, rotation) values ('00000000-0000-0000-0000-00000000000a','text',90)$q$, 'rotation out of range rejected', 'check constraint');
  select id into cid from profile_cards where profile_id = alice and type = 'about';
  perform save_card_layout(jsonb_build_array(jsonb_build_object('id', cid, 'x', 111, 'y', 222, 'rotation', 3)));
  perform t.ok((select x from profile_cards where id = cid) = 111, 'save_card_layout moves card');
  perform t.as_admin();
  perform t.as_user(bob);
  perform save_card_layout(jsonb_build_array(jsonb_build_object('id', cid, 'x', 999)));
  perform t.ok((select x from profile_cards where id = cid) = 111, 'bob cannot move alice''s card (RLS)');
  perform t.affects_none(format($q$delete from profile_cards where id = %L$q$, cid), 'bob cannot delete alice''s card');
  perform t.as_admin();

  -- ---- friends ----
  perform t.as_user(alice);
  fid := send_friend_request(bob);
  perform t.ok(fid is not null, 'alice sends request');
  perform t.ok(send_friend_request(bob) = fid, 'duplicate request is idempotent');
  perform t.fails($q$select send_friend_request('00000000-0000-0000-0000-00000000000a')$q$, 'cannot friend self');
  perform t.fails($q$insert into friendships (requester_id, addressee_id, status) values ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000c','accepted')$q$ , 'cannot insert friendship directly');
  perform t.as_admin();
  perform t.as_user(carol);
  perform t.ok((select count(*) from friendships) = 0, 'carol cannot see alice-bob request');
  perform t.as_admin();
  perform t.as_user(alice);
  perform t.fails(format($q$select respond_friend_request(%L, true)$q$, fid), 'requester cannot accept own request');
  perform t.as_admin();
  perform t.as_user(bob);
  perform respond_friend_request(fid, true);
  perform t.ok(are_friends(alice, bob), 'bob accepts -> friends');
  perform t.as_admin();
  -- reverse pending auto-accept
  perform t.as_user(carol); perform send_friend_request(alice); perform t.as_admin();
  perform t.as_user(alice); perform send_friend_request(carol);
  perform t.ok(are_friends(alice, carol), 'mutual request auto-accepts');
  perform remove_friend(carol);
  perform t.ok(not are_friends(alice, carol), 'remove_friend works');
  perform t.as_admin();

  -- ---- top 8 ----
  perform t.as_user(alice);
  perform set_top_friends(array[bob]);
  perform t.ok((select rank from top_friends where profile_id = alice and friend_id = bob) = 1, 'top friends saved');
  perform t.fails(format($q$select set_top_friends(array[%L::uuid])$q$, carol), 'non-friend rejected from top 8');
  perform t.fails(format($q$select set_top_friends(array[%L::uuid,%L::uuid])$q$, bob, bob), 'duplicate rejected');
  perform t.ok((select count(*) from friends_of(alice)) = 1, 'friends_of lists bob');
  perform t.as_admin();

  -- ---- wall ----
  perform t.as_user(carol);
  insert into wall_comments (profile_id, author_id, body) values (alice, carol, 'hi from carol');
  perform t.fails(format($q$insert into wall_comments (profile_id, author_id, body) values (%L, %L, 'spoof')$q$, alice, bob), 'cannot post wall comment as someone else');
  perform t.as_admin();
  perform t.as_user(alice);
  update profiles set wall_policy = 'friends' where id = alice;
  perform t.as_admin();
  perform t.as_user(carol);
  perform t.fails(format($q$insert into wall_comments (profile_id, author_id, body) values (%L, %L, 'again')$q$, alice, carol), 'friends-only wall blocks non-friend');
  perform t.as_admin();
  perform t.as_user(bob);
  insert into wall_comments (profile_id, author_id, body) values (alice, bob, 'hi from bob');
  perform t.as_admin();
  perform t.as_user(alice);
  select id into cid from wall_comments where author_id = carol and profile_id = alice;
  delete from wall_comments where id = cid;
  perform t.ok((select count(*) from wall_comments where profile_id = alice) = 1, 'wall owner can delete comments');
  perform t.as_admin();

  -- ---- posts + visibility ----
  perform t.as_user(alice);
  insert into posts (author_id, locality_id, kind, body) values (alice, 1, 'status', 'public post') returning id into pid;
  insert into posts (author_id, locality_id, kind, body, visibility) values (alice, 1, 'status', 'friends only', 'friends');
  insert into posts (author_id, locality_id, kind, body, event_at, event_place)
    values (alice, 1, 'event', 'concert', now() + interval '2 days', 'Piata');
  perform t.fails($q$insert into posts (author_id, kind, body) values ('00000000-0000-0000-0000-00000000000a','event','no date')$q$, 'event without date rejected', 'check constraint');
  perform t.as_admin();
  perform t.as_user(bob);
  perform t.ok((select count(*) from local_feed(1)) = 3, 'friend sees all 3 posts');
  insert into post_comments (post_id, author_id, body) values (pid, bob, 'nice');
  perform t.ok((select comment_count from local_feed(1) where id = pid) = 1, 'comment_count correct');
  perform t.ok((select count(*) from local_feed(1, true)) = 3, 'only_friends feed includes friend posts');
  perform t.as_admin();
  perform t.as_user(carol);
  perform t.ok((select count(*) from local_feed(1)) = 2, 'non-friend does not see friends-only post');
  perform t.ok((select count(*) from local_feed(1, true)) = 0, 'only_friends feed empty for carol');
  perform t.ok((select count(*) from local_feed(null, false, null, 10, 'event')) = 1, 'kind filter works');
  perform t.as_admin();

  -- ---- discovery / search / map ----
  perform t.as_user(alice);
  update profiles set locality_id = 1, show_on_map = true where id = alice;
  perform t.as_admin();
  perform t.as_user(bob);
  update profiles set locality_id = 1, show_on_map = true where id = bob;
  perform t.ok((select count(*) from discover_profiles()) = 1, 'discover excludes self + friends (only carol left)');
  perform t.ok((select count(*) from search_profiles('ali')) = 1, 'search finds alice');
  perform t.ok((select count(*) from search_profiles('%')) = 0, 'search escapes wildcards / min length');
  perform t.ok((select count(*) from friends_map()) = 0, 'map empty: localities have no coords yet');
  perform t.as_admin();
  update localities set lat = 1, lng = 2 where id = 1;
  perform t.as_user(bob);
  perform t.ok((select count(*) from friends_map()) = 1, 'map shows opted-in friend once coords exist');
  perform t.as_admin();
  perform t.as_user(alice);
  update profiles set show_on_map = false where id = alice;
  perform t.as_admin();
  perform t.as_user(bob);
  perform t.ok((select count(*) from friends_map()) = 0, 'map hides friend who opted out');
  perform t.as_admin();

  -- ---- blocks ----
  perform t.as_user(alice);
  insert into blocks (blocker_id, blocked_id) values (alice, bob);
  perform t.as_admin();
  perform t.ok(not are_friends(alice, bob), 'block severs friendship');
  perform t.ok((select count(*) from top_friends where profile_id = alice) = 0, 'block clears top 8');
  perform t.as_user(bob);
  perform t.ok((select count(*) from profiles where id = alice) = 0, 'blocked user cannot see blocker profile');
  perform t.ok((select count(*) from posts where author_id = alice) = 0, 'blocked user cannot see blocker posts');
  perform t.ok((select count(*) from profile_cards where profile_id = alice) = 0, 'blocked user cannot see blocker cards');
  perform t.fails(format($q$select send_friend_request(%L)$q$, alice), 'blocked user cannot send request');
  perform t.fails(format($q$insert into wall_comments (profile_id, author_id, body) values (%L, %L, 'x')$q$, alice, bob), 'blocked user cannot post on wall');
  perform t.ok((select count(*) from blocks) = 0, 'blocked user cannot see block rows');
  perform t.as_admin();

  -- ---- reports ----
  perform t.as_user(carol);
  insert into reports (reporter_id, target_type, target_id, reason) values (carol, 'post', pid, 'spam');
  perform t.ok((select count(*) from reports) = 0, 'reports are write-only for users');
  perform t.as_admin();

  -- ---- anon sees nothing ----
  execute 'set local role anon';
  perform t.fails('select count(*) from public.profiles', 'anon cannot read profiles');
  perform t.ok((select count(*) from public.localities) = 10, 'anon can read localities');
  perform t.fails('select * from public.discover_profiles()', 'anon cannot call discover');
  perform t.as_admin();

  -- ---- rate limit ----
  perform t.as_user(carol);
  for i in 1..10 loop insert into posts (author_id, body) values (carol, 'spam ' || i); end loop;
  perform t.fails($q$insert into posts (author_id, body) values ('00000000-0000-0000-0000-00000000000c','spam 11')$q$, 'post rate limit kicks in', 'rate_limit');
  perform t.as_admin();

  -- ---- storage policy ----
  perform t.as_user(alice);
  insert into storage.objects (bucket_id, name, owner) values ('media', alice::text || '/a.webp', alice);
  perform t.fails(format($q$insert into storage.objects (bucket_id, name, owner) values ('media', %L, %L)$q$, bob::text || '/evil.webp', alice), 'cannot upload into another user folder');
  perform t.as_admin();

  -- ---- export / delete ----
  perform t.as_user(alice);
  perform t.ok(jsonb_array_length(export_my_data()->'cards') = 5, 'export_my_data includes cards');
  perform delete_my_account();
  perform t.as_admin();
  perform t.ok((select count(*) from profiles where id = alice) = 0, 'delete_my_account removes profile');
  perform t.ok((select count(*) from profile_cards where profile_id = alice) = 0, 'cards cascade on delete');
  perform t.ok((select count(*) from posts where author_id = alice) = 0, 'posts cascade on delete');
  raise notice 'ALL TESTS PASSED';
end $$;
