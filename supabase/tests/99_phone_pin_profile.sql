-- 0055: a sticker's phone pin must point at a card on the SAME profile.
-- Needs t.* helpers from 10_tests.sql. Fails (first assertion) without 0055.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
        cid_a uuid; cid_b uuid; sid_a uuid;
begin
  perform t.as_admin();

  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
    (a, 'c55a@t.t', now(), '{"username":"phone55a","display_name":"Ann"}'),
    (b, 'c55b@t.t', now(), '{"username":"phone55b","display_name":"Ben"}');

  select id into cid_a from public.profile_cards where profile_id = a and type = 'about';
  select id into cid_b from public.profile_cards where profile_id = b and type = 'about';

  perform t.as_user(a);
  insert into public.profile_cards (profile_id, type, content) values (a, 'sticker', '{"images":[]}') returning id into sid_a;

  -- 1. a pin to another profile's card is rejected
  perform t.fails(format('update public.profile_cards set phone_layout = %L where id = %L',
    format('{"pin":{"card":"%s","v":"b"}}', cid_b), sid_a),
    'pin to another profile''s card is rejected', 'phone pin must point at a card on the same profile');

  -- 2. a pin to the same profile's card is accepted
  update public.profile_cards set phone_layout = format('{"pin":{"card":"%s","v":"t"}}', cid_a)::jsonb where id = sid_a;
  perform t.ok((select phone_layout->'pin'->>'card' = cid_a::text from public.profile_cards where id = sid_a),
    'pin to a card on the same profile is accepted');

  -- 3. a card with no pin is accepted
  update public.profile_cards set phone_layout = '{"y":40,"scale":1}'::jsonb where id = sid_a;
  perform t.ok((select phone_layout->>'y' = '40' from public.profile_cards where id = sid_a),
    'a sticker with no pin is accepted');

  perform t.as_admin();
  raise notice '99_phone_pin_profile PASSED';
end $$;
