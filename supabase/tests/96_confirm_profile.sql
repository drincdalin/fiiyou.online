-- 0043: a profile only exists once the email is confirmed. Needs t.* helpers from 10_tests.sql.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
        n int; uname text; ok boolean;
begin
  perform t.as_admin();

  -- 1. signing up (email not confirmed yet) creates no profile and no starter cards
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values (a, 'c43a@t.t', null, '{"username":"pending43","display_name":"Pending"}');
  select count(*) into n from public.profiles where id = a;                  perform t.ok(n = 0, 'unconfirmed sign-up has no profile (so it cannot show in Discover or Search)');
  select count(*) into n from public.profile_cards where profile_id = a;     perform t.ok(n = 0, 'unconfirmed sign-up has no starter cards');

  -- 2. its username is held for other people, but the same email can retry
  select public.username_available('pending43') into ok;                    perform t.ok(ok = false, 'a pending sign-up holds its username against everyone else');
  select public.username_available('pending43', 'someone@else.t') into ok;  perform t.ok(ok = false, 'a different email cannot take the pending username');
  select public.username_available('pending43', 'C43A@t.t') into ok;        perform t.ok(ok = true,  'the same email can retry its own pending username (case-insensitive)');
  select public.username_available('free43name') into ok;                   perform t.ok(ok = true,  'an unused username is available');
  select public.username_available('ab') into ok;                           perform t.ok(ok = false, 'bad usernames are still refused');

  -- 3. confirming the email creates the profile with the chosen username, and the four starter cards
  update auth.users set email_confirmed_at = now() where id = a;
  select username into uname from public.profiles where id = a;              perform t.ok(uname = 'pending43', 'confirming creates the profile with the username they picked');
  select count(*) into n from public.profile_cards where profile_id = a;     perform t.ok(n = 4, 'confirming creates the four starter cards');
  select public.username_available('pending43') into ok;                    perform t.ok(ok = false, 'and the name is now held by the real profile');
  select onboarded_at is null into ok from public.profiles where id = a;     perform t.ok(ok, 'a new profile still goes through onboarding');

  -- 4. confirming again, or any later update, never creates a second profile
  update auth.users set email_confirmed_at = now() + interval '1 minute' where id = a;
  select count(*) into n from public.profiles where id = a;                  perform t.ok(n = 1, 'a second update does not duplicate the profile');
  select count(*) into n from public.profile_cards where profile_id = a;     perform t.ok(n = 4, 'nor the cards');

  -- 5. a row that is already confirmed when inserted (confirmation switched off) gets its profile right away
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values (b, 'c43b@t.t', now(), '{"username":"instant43","display_name":"Instant"}');
  select count(*) into n from public.profiles where id = b and username = 'instant43';   perform t.ok(n = 1, 'a pre-confirmed sign-up gets a profile at once');

  -- 6. two people pick the same name; the one who confirms second still gets an account (a safe fallback name)
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, created_at) values (c, 'c43c@t.t', null, '{"username":"race43"}', now() - interval '25 hours');
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values (d, 'c43d@t.t', null, '{"username":"race43"}');
  update auth.users set email_confirmed_at = now() where id = d;
  update auth.users set email_confirmed_at = now() where id = c;
  select username into uname from public.profiles where id = d;              perform t.ok(uname = 'race43', 'first to confirm gets the name');
  select username into uname from public.profiles where id = c;              perform t.ok(uname like 'user\_%', 'second to confirm still gets an account, with a fallback name');

  -- 7. a pending sign-up older than 24h no longer holds its name
  select public.username_available('stale43') into ok;                       perform t.ok(ok = true, 'sanity: unused name');
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, created_at) values (gen_random_uuid(), 'c43e@t.t', null, '{"username":"stale43"}', now() - interval '30 hours');
  select public.username_available('stale43') into ok;                       perform t.ok(ok = true, 'an abandoned sign-up (over 24h) does not hold its username');

  -- 8. the sign-up screen (signed out) can still call it
  execute 'set local role anon';
  select public.username_available('free43name', 'x@y.t') into ok;          perform t.ok(ok = true, 'signed-out visitors can check a username with an email');
  perform t.as_admin();
end $$;
