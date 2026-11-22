-- 0024: onboarding flag + diacritic-insensitive search with locality filter. Runs after 10_tests.sql (uses its t.* helpers).
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
        loc1 int; loc2 int; names text;
begin
  select id into loc1 from public.localities where slug = 'beius';
  select id into loc2 from public.localities where slug = 'vascau';
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'oa@t.t', '{"username":"obsearcha","display_name":"Ștefan Țigănuș"}'),
    (b, 'ob@t.t', '{"username":"obsearchb","display_name":"Ana Stefanescu"}'),
    (c, 'oc@t.t', '{"username":"obsearchc","display_name":"100% real_name"}');
  update public.profiles set locality_id = loc1 where id in (a, c);
  update public.profiles set locality_id = loc2 where id = b;

  -- new accounts start un-onboarded
  perform t.ok((select onboarded_at is null from public.profiles where id = a), 'new account is not onboarded yet');

  perform t.as_user(a);
  update public.profiles set onboarded_at = now() where id = a;
  perform t.ok((select onboarded_at is not null from public.profiles where id = a), 'user can mark themselves onboarded');
  perform t.affects_none(format('update public.profiles set onboarded_at = null where id = %L', b), 'cannot change someone else''s onboarding flag');

  -- search ignores diacritics both ways
  select string_agg(username, ',' order by username) into names from public.search_profiles('stefan');
  perform t.ok(names = 'obsearcha,obsearchb', 'stefan finds Ștefan and Stefanescu (got ' || coalesce(names, 'nothing') || ')');
  select string_agg(username, ',') into names from public.search_profiles('ȚIGĂNUȘ');
  perform t.ok(names = 'obsearcha', 'upper-case diacritics query finds Țigănuș');
  select string_agg(username, ',') into names from public.search_profiles('tiganus');
  perform t.ok(names = 'obsearcha', 'plain letters find Țigănuș');
  -- prefix matches sort first
  perform t.ok((select username from public.search_profiles('stef') limit 1) = 'obsearcha', 'name that starts with the text comes first');
  -- locality filter
  select string_agg(username, ',') into names from public.search_profiles('stefan', 20, loc2);
  perform t.ok(names = 'obsearchb', 'locality filter keeps only that locality');
  -- wildcards are literal
  select string_agg(username, ',') into names from public.search_profiles('100%');
  perform t.ok(names = 'obsearchc', 'percent sign is matched literally');
  perform t.ok((select count(*) from public.search_profiles('%%')) = 0, 'a bare wildcard matches nothing');
  perform t.ok((select count(*) from public.search_profiles('a')) = 0, 'one letter returns nothing');
  perform t.as_admin();
end $$;
