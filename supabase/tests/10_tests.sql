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
  fid uuid; n int; pid uuid; cid uuid; ipath text;
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
  update profiles set theme = '{"font":"ubuntu","name_font":"ubuntu","card_color":"#141414","radius":"8","overlay":"60"}' where id = alice;
  perform t.ok((select theme->>'radius' from profiles where id = alice) = '8', 'theme v2 keys saved');
  perform t.fails($q$update profiles set theme = '{"radius":"999"}' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'bad radius rejected', 'check constraint');
  perform t.fails($q$update profiles set theme = '{"bg_color":"red"}' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'named color rejected', 'check constraint');
  perform t.fails($q$update profiles set theme = '{"css":"body{display:none}"}' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'unknown theme key rejected', 'check constraint');
  perform t.fails($q$update profiles set theme = '{"bg_image":"../../etc/passwd"}' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'bad bg_image path rejected', 'check constraint');
  perform t.affects_none(format($q$update profiles set bio = 'hacked' where id = %L$q$, bob), 'cannot edit other profile');
  perform t.fails(format($q$insert into profiles (id, username, display_name) values (gen_random_uuid(),'evil','Evil')$q$), 'cannot insert profile directly');

  update profiles set theme = '{"radius":"24","step":"8","layout":"side-right","shadow":"hard","frame_color":"#000000","name_case":"normal"}' where id = alice;
  perform t.ok((select theme->>'step' from profiles where id = alice) = '8', 'theme v3 keys saved');
  perform t.fails($q$update profiles set theme = '{"step":"7"}' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'bad step rejected', 'check constraint');
  update profiles set music = '{"url":"https://youtu.be/abcdefghijk","title":"t","artist":"a"}' where id = alice;
  perform t.ok((select music->>'title' from profiles where id = alice) = 't', 'profile music saved');
  perform t.fails($q$update profiles set music = '{"url":"ftp://x"}' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'bad music url rejected', 'check constraint');
  perform t.fails($q$update profiles set music = '{"evil":"1"}' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'unknown music key rejected', 'check constraint');
  update profiles set music = '{"audio":"00000000-0000-0000-0000-00000000000a/00000000-0000-0000-0000-0000000000aa.mp3","title":"t"}' where id = alice;
  perform t.ok((select music ? 'audio' from profiles where id = alice), 'profile audio path saved');
  perform t.fails($q$update profiles set music = '{"audio":"../x.mp3"}' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'bad audio path rejected', 'check constraint');
  update profiles set custom_css = '[{"s":"card","p":{"background-color":"#112233","border-radius":"16px","transform":"rotate(-3deg)","box-shadow":"glow","opacity":"0.9"}}]' where id = '00000000-0000-0000-0000-00000000000a';
  perform t.ok((select jsonb_array_length(custom_css) from profiles where id = '00000000-0000-0000-0000-00000000000a') = 1, 'custom style rule saved');
  perform t.fails($q$update profiles set custom_css = '[{"s":"card","p":{"background":"url(http://evil.test/x.png)"}}]' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'raw background/url rejected', 'check constraint');
  perform t.fails($q$update profiles set custom_css = '[{"s":"card","p":{"color":"red;position:fixed"}}]' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'injected declaration rejected', 'check constraint');
  perform t.fails($q$update profiles set custom_css = '[{"s":"body","p":{"color":"#ffffff"}}]' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'non-whitelisted selector rejected', 'check constraint');
  perform t.fails($q$update profiles set custom_css = '[{"s":"card","p":{"transform":"rotate(90deg)"}}]' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'out-of-range value rejected', 'check constraint');
  perform t.fails($q$update profiles set custom_css = '[{"s":"card","p":{"color":"#ffffff"},"x":1}]' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'extra rule key rejected', 'check constraint');
  perform t.fails($q$update profiles set custom_css = '[{"s":"card"}]' where id = '00000000-0000-0000-0000-00000000000a'$q$, 'rule without props rejected', 'check constraint');
  -- ---- cards ----
  insert into profile_cards (profile_id, type, title, content) values (alice, 'music', 'Music', '{"url":""}');
  perform t.ok(true, 'music card with empty url accepted');
  insert into profile_cards (profile_id, type, content, x, y, w, h, rotation) values (alice, 'sticker', '{"images":[]}', -50, 10, 120, 90, 120);
  perform t.ok(true, 'sticker with negative x and 120deg accepted');
  perform t.fails($q$insert into profile_cards (profile_id, type, content) values ('00000000-0000-0000-0000-00000000000a','music','{"url":"ftp://x"}')$q$, 'non-http music url rejected', 'check constraint');
  perform t.fails($q$insert into profile_cards (profile_id, type, content) values ('00000000-0000-0000-0000-00000000000a','links','{"links":[{"url":"javascript:alert(1)","label":"x"}]}')$q$, 'javascript: link rejected', 'check constraint');
  insert into profile_cards (profile_id, type, title, content, style, rotation)
    values (alice, 'links', 'Links', '{"links":[{"url":"https://optimeal.site","label":"opt"}]}', '{"border_style":"dashed","border_width":3,"shadow":true}', -7.5);
  perform t.fails($q$insert into profile_cards (profile_id, type, style) values ('00000000-0000-0000-0000-00000000000a','text','{"border_width":99}')$q$, 'border_width out of range rejected', 'check constraint');
  perform t.fails($q$insert into profile_cards (profile_id, type, rotation) values ('00000000-0000-0000-0000-00000000000a','text',200)$q$, 'rotation out of range rejected', 'check constraint');
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

  -- ---- v10: official flag, likes, photos, views, chat, places ----
  perform t.as_user(carol);
  perform t.fails(format($q$update profiles set is_official = true where id = %L$q$, carol), 'user cannot self-promote to official', 'permission denied');
  perform t.as_admin();
  update profiles set is_official = true where id = carol;
  perform t.as_user(bob);
  perform t.ok((select author_official from local_feed(1) where author_id = carol limit 1) is not false, 'official flag visible in feed');
  insert into places (name, lat, lng, created_by) values ('Test spot', 46.5, 22.3, bob) returning id into cid;
  insert into posts (author_id, body, place_id) values (bob, 'at the spot', cid);
  insert into post_likes (post_id, user_id) select id, bob from posts where body = 'at the spot';
  perform t.ok((select like_count from local_feed(null,false,null,10,null,cid)) = 1 and (select liked from local_feed(null,false,null,10,null,cid)), 'place feed + like count');
  perform t.ok((select post_count from places_overview() where id = cid) = 1, 'places_overview counts posts');
  insert into photos (owner_id, path, position) values (bob, bob::text || '/11111111-1111-1111-1111-111111111111.webp', 2), (bob, bob::text || '/22222222-2222-2222-2222-222222222222.webp', 1);
  perform reorder_photos(array(select id from photos where owner_id = bob order by position desc));
  perform t.ok((select path from photos_of(bob) limit 1) like '%1111%', 'reorder_photos applies');
  perform t.as_admin();
  perform t.as_user(carol);
  perform record_profile_view(bob); perform record_profile_view(bob);
  perform t.ok(profile_view_count(bob) = 2, 'every visit counts (0017: no longer one per viewer per day)');
  perform record_profile_view(carol);
  perform t.ok(profile_view_count(carol) = 0, 'own view not counted');
  perform t.fails(format($q$insert into messages (sender_id, recipient_id, body) values (%L, %L, 'hi')$q$, carol, bob), 'chat blocked for non-friends');
  perform t.as_admin();
  perform t.as_user(bob);
  perform t.ok((select count(*) from profile_views) = 0, 'profile_views unreadable');
  perform t.as_admin();
  -- ---- v11: osm places + friends chat ----
  perform t.as_admin(); perform t.as_user(bob);
  insert into places (name, lat, lng, created_by, osm_ref) values ('OSM spot', 1, 1, bob, 'node/42');
  perform t.fails(format($q$insert into places (name, lat, lng, created_by, osm_ref) values ('Dup', 1, 1, %L, 'node/42')$q$, bob), 'duplicate osm_ref rejected', 'duplicate key');
  perform t.fails(format($q$insert into places (name, lat, lng, created_by, osm_ref) values ('Bad', 1, 1, %L, 'nope')$q$, bob), 'malformed osm_ref rejected', 'check constraint');
  perform send_friend_request(carol);
  perform t.as_admin(); perform t.as_user(carol);
  perform respond_friend_request((select id from friendships where requester_id = bob and addressee_id = carol), true);
  insert into messages (sender_id, recipient_id, body) values (carol, bob, 'hey bob');
  perform t.as_admin(); perform t.as_user(bob);
  perform t.ok((select unread from conversations() limit 1) = 1, 'conversation shows 1 unread');
  perform mark_read(carol);
  perform t.ok(unread_count() = 0, 'mark_read clears unread');
  perform t.as_admin();
  -- ---- v14: admin ----
  perform t.as_admin();
  update auth.users set email = 'Boss@Example.com', email_confirmed_at = null where id = carol;
  insert into admin_emails (email) values ('boss@example.com');
  perform t.as_user(carol);
  perform t.ok(not is_admin(), 'unconfirmed email is not admin');
  perform t.as_admin(); update auth.users set email_confirmed_at = now() where id = carol;
  perform t.as_user(bob);
  perform t.ok(not is_admin(), 'regular member is not admin');
  perform t.fails('select admin_stats()', 'non-admin blocked from stats', 'forbidden');
  perform t.fails(format($q$select admin_set_verified(%L, true)$q$, bob), 'non-admin cannot verify', 'forbidden');
  perform t.fails(format($q$select admin_delete_user(%L)$q$, carol), 'non-admin cannot delete users', 'forbidden');
  perform t.ok((select count(*) from admin_emails) = 0, 'admin list invisible to members');
  perform t.fails('select log_admin(''x'', ''y'')', 'members cannot forge audit log entries', 'forbidden');
  insert into reports (reporter_id, target_type, target_id, reason) select bob, 'post', id, 'spam' from posts where body = 'at the spot';
  perform t.as_admin(); update posts set image_path = bob::text || '/33333333-3333-3333-3333-333333333333.webp' where body = 'at the spot';
  perform t.as_user(carol);
  perform t.ok(is_admin(), 'confirmed matching email (case-insensitive) is admin');
  perform t.ok((admin_stats()->>'open_reports')::int >= 1, 'admin_stats works');
  perform t.ok((select preview->>'body' from admin_reports('open') where target_type = 'post' limit 1) = 'at the spot', 'report preview shows the post');
  perform admin_set_verified(bob, true);
  perform t.ok((select is_official from profiles where id = bob), 'admin can verify a profile');
  select admin_delete_post(id) into ipath from posts where body = 'at the spot';
  perform t.ok(ipath like '%3333%', 'admin_delete_post returns the image path for storage clean-up');
  perform t.ok(not exists (select 1 from posts where body = 'at the spot'), 'post removed');
  perform admin_set_report((select id from reports limit 1), 'reviewed');
  perform t.fails(format($q$select admin_delete_user(%L)$q$, carol), 'admin cannot delete themselves', 'cannot_delete_self');
  perform t.ok((select count(*) from admin_log(10)) >= 3, 'actions are logged');
  perform t.ok((select count(*) from admin_referenced_paths()) >= 1, 'referenced paths listed');
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
  perform t.ok(jsonb_array_length(export_my_data()->'cards') = 7, 'export_my_data includes cards');
  perform t.ok(export_my_data() ?& array['messages','photos','places_created','post_likes','reports_filed'] and not ((export_my_data()->'profile') ? 'is_official'), 'export covers everything, hides internal flags');
  perform delete_my_account();
  perform t.as_admin();
  perform t.ok((select count(*) from profiles where id = alice) = 0, 'delete_my_account removes profile');
  perform t.ok((select count(*) from profile_cards where profile_id = alice) = 0, 'cards cascade on delete');
  perform t.ok((select count(*) from posts where author_id = alice) = 0, 'posts cascade on delete');
  raise notice 'ALL TESTS PASSED';
end $$;
