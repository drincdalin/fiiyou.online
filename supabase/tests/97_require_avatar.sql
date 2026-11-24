-- 0053: a profile photo is required to finish onboarding. Needs t.* helpers from 10_tests.sql.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
        av text := '99999999-9999-4999-8999-999999999999/avatar.png';
begin
  perform t.as_admin();

  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
    (a, 'c53a@t.t', now(), '{"username":"avatar53a","display_name":"Ava"}'),
    (b, 'c53b@t.t', now(), '{"username":"avatar53b","display_name":"Bob"}');

  -- 1. a new profile has no avatar and is not onboarded
  perform t.ok((select onboarded_at is null and avatar_path is null from public.profiles where id = a),
    'a new profile starts with no avatar and no onboarding');

  -- 2. finishing onboarding (setting onboarded_at) with no avatar is refused, by the user and by anyone else
  perform t.as_user(a);
  perform t.fails(format('update public.profiles set onboarded_at = now() where id = %L', a),
    'a user with no photo cannot mark themselves onboarded', 'profiles_require_avatar');
  perform t.as_admin();
  perform t.fails(format('update public.profiles set onboarded_at = now() where id = %L', a),
    'the rule holds even for the admin, not just a client-side nicety', 'profiles_require_avatar');

  -- 3. uploading the photo first (avatar_path set, still not onboarded) is allowed, then onboarding succeeds
  perform t.as_user(a);
  update public.profiles set avatar_path = av where id = a;
  perform t.ok((select avatar_path = av and onboarded_at is null from public.profiles where id = a),
    'a photo can be set before onboarding is finished');
  update public.profiles set onboarded_at = now() where id = a;
  perform t.ok((select onboarded_at is not null from public.profiles where id = a),
    'with a photo, the user can mark themselves onboarded');

  -- 4. an onboarded account cannot remove its photo
  perform t.fails(format('update public.profiles set avatar_path = null where id = %L', a),
    'an onboarded account cannot clear its photo', 'profiles_require_avatar');

  -- 5. a photo-less account that is not onboarded yet can still edit ordinary fields (the rule only guards onboarding)
  perform t.as_user(b);
  update public.profiles set headline = 'hi' where id = b;
  perform t.ok((select headline = 'hi' from public.profiles where id = b),
    'a photo-less account can still edit ordinary fields before onboarding');

  perform t.as_admin();
end $$;
