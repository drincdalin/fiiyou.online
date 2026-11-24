-- 0054: per-device (phone) profile customisation. Needs t.* helpers from 10_tests.sql.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
        cid uuid; sid uuid;
begin
  perform t.as_admin();

  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
    (a, 'c54a@t.t', now(), '{"username":"phone54a","display_name":"Ava"}'),
    (b, 'c54b@t.t', now(), '{"username":"phone54b","display_name":"Bob"}');

  -- 1. defaults are empty and existing rows are unchanged
  perform t.ok((select phone_theme = '{}'::jsonb from public.profiles where id = a),
    'a new profile defaults to an empty phone theme');
  perform t.ok((select count(*) = 4 and bool_and(phone_layout = '{}'::jsonb)
                from public.profile_cards where profile_id = a),
    'starter cards default to an empty phone layout (no visible change)');
  select id into cid from public.profile_cards where profile_id = a and type = 'about';

  -- 2. the owner can write a valid phone layout and theme
  perform t.as_user(a);
  update public.profile_cards set phone_layout = '{"order":3,"visible":false,"w":300,"h":180}' where id = cid;
  perform t.ok((select phone_layout->>'order' = '3' and phone_layout->>'visible' = 'false'
                from public.profile_cards where id = cid),
    'owner writes a flow-card phone layout (order / visible / size)');
  update public.profiles set phone_theme = '{"bg_image":"99999999-9999-4999-8999-999999999999/bg.webp","font_size":"18"}' where id = a;
  perform t.ok((select phone_theme->>'font_size' = '18' from public.profiles where id = a),
    'owner writes a phone theme override (bg_image + font_size)');
  insert into public.profile_cards (profile_id, type, content) values (a, 'sticker', '{"images":[]}') returning id into sid;
  update public.profile_cards set phone_layout = format('{"pin":{"card":"%s","v":"b"},"y":-120,"scale":1.5}', cid)::jsonb where id = sid;
  perform t.ok((select phone_layout->>'scale' = '1.5' from public.profile_cards where id = sid),
    'owner writes a sticker phone pin + vertical offset + scale');
  perform t.as_admin();

  -- 3. another user cannot write it (RLS)
  perform t.as_user(b);
  perform t.affects_none(format('update public.profile_cards set phone_layout = %L where id = %L', '{"order":0}', cid),
    'another user cannot write a card phone layout (RLS)');
  perform t.affects_none(format('update public.profiles set phone_theme = %L where id = %L', '{"font_size":"13"}', a),
    'another user cannot write a phone theme (RLS)');
  perform t.as_admin();

  -- 4. oversized or malformed values are rejected by the database
  perform t.as_user(a);
  perform t.fails(format('update public.profile_cards set phone_layout = %L where id = %L', '{"order":80}', cid),
    'order above the max is rejected', 'check constraint');
  perform t.fails(format('update public.profile_cards set phone_layout = %L where id = %L', '{"w":5000}', cid),
    'width above the max is rejected', 'check constraint');
  perform t.fails(format('update public.profile_cards set phone_layout = %L where id = %L', '{"evil":1}', cid),
    'unknown phone-layout key is rejected', 'check constraint');
  perform t.fails(format('update public.profile_cards set phone_layout = %L where id = %L', '[1,2,3]', cid),
    'non-object phone layout is rejected', 'check constraint');
  perform t.fails(format('update public.profile_cards set phone_layout = %L where id = %L', '{"order":3}', sid),
    'flow keys are rejected on a sticker', 'check constraint');
  perform t.fails(format('update public.profiles set phone_theme = %L where id = %L', '{"accent_color":"#ff0000"}', a),
    'the shared accent cannot be overridden on a phone', 'check constraint');
  perform t.fails(format('update public.profiles set phone_theme = %L where id = %L', '{"bg_image":"../../etc/passwd"}', a),
    'bad phone bg_image path is rejected', 'check constraint');
  perform t.fails(format('update public.profiles set phone_theme = %L where id = %L', '{"font_size":"99"}', a),
    'bad phone font size is rejected', 'check constraint');

  perform t.as_admin();
  raise notice '98_phone_profile PASSED';
end $$;
