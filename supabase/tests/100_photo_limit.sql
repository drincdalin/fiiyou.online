-- 0058: at most 15 gallery photos per profile; profiles that already hold more keep them. Needs t.* helpers from 10_tests.sql.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); i int; first_id uuid;
begin
  perform t.as_admin();
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
    (a, 'p58a@t.t', now(), '{"username":"photolim58a","display_name":"Pia"}'),
    (b, 'p58b@t.t', now(), '{"username":"photolim58b","display_name":"Pat"}');

  -- 1. the first 15 photos are accepted
  perform t.as_user(a);
  for i in 1..15 loop
    insert into public.photos (owner_id, path, position) values (a, a::text || '/' || gen_random_uuid() || '.webp', i);
  end loop;
  perform t.ok((select count(*) from public.photos where owner_id = a) = 15, 'a profile can hold 15 photos');

  -- 2. the 16th is refused with the code the app turns into a sentence
  perform t.fails(format($q$insert into public.photos (owner_id, path, position) values (%L, %L, 16)$q$, a, a::text || '/' || gen_random_uuid() || '.webp'),
    'a 16th photo is refused', 'photo_limit');
  perform t.ok((select count(*) from public.photos where owner_id = a) = 15, 'the refused photo was not stored');

  -- 3. the limit is per profile: another user is not affected
  perform t.as_user(b);
  insert into public.photos (owner_id, path, position) values (b, b::text || '/' || gen_random_uuid() || '.webp', 1);
  perform t.ok((select count(*) from public.photos where owner_id = b) = 1, 'another user can still add photos');

  -- 4. deleting one frees exactly one slot
  perform t.as_user(a);
  delete from public.photos where id = (select id from public.photos where owner_id = a order by position limit 1);
  insert into public.photos (owner_id, path, position) values (a, a::text || '/' || gen_random_uuid() || '.webp', 16);
  perform t.ok((select count(*) from public.photos where owner_id = a) = 15, 'after one delete, one more photo fits');
  perform t.fails(format($q$insert into public.photos (owner_id, path, position) values (%L, %L, 17)$q$, a, a::text || '/' || gen_random_uuid() || '.webp'),
    'and then the profile is full again', 'photo_limit');

  -- 5. a profile from before the limit (17 photos) is left alone: kept, still manageable, but cannot add
  perform t.as_admin();
  alter table public.photos disable trigger photos_limit;       -- how such a profile came to exist: the old limit was 60
  for i in 1..2 loop
    insert into public.photos (owner_id, path, position) values (b, b::text || '/' || gen_random_uuid() || '.webp', 1 + i);
  end loop;
  for i in 1..14 loop
    insert into public.photos (owner_id, path, position) values (b, b::text || '/' || gen_random_uuid() || '.webp', 10 + i);
  end loop;
  alter table public.photos enable trigger photos_limit;
  perform t.ok((select count(*) from public.photos where owner_id = b) = 17, 'an older profile keeps all 17 photos');

  perform t.as_user(b);
  perform t.fails(format($q$insert into public.photos (owner_id, path, position) values (%L, %L, 99)$q$, b, b::text || '/' || gen_random_uuid() || '.webp'),
    'an over-limit profile cannot add another photo', 'photo_limit');
  perform t.ok((select count(*) from photos_of(b)) = 17, 'photos_of still returns every photo of an over-limit profile');
  perform reorder_photos(array(select id from public.photos where owner_id = b order by position desc));
  update public.photos set caption = 'still editable' where id = (select id from public.photos where owner_id = b limit 1);
  perform t.ok((select count(*) from public.photos where owner_id = b and caption = 'still editable') = 1, 'an over-limit profile can still reorder and caption');

  -- 6. the owner is not locked out: down to 15 is still full, down to 14 lets one photo in
  delete from public.photos where id in (select id from public.photos where owner_id = b order by position limit 2);
  perform t.ok((select count(*) from public.photos where owner_id = b) = 15, 'deleting down to the limit works');
  perform t.fails(format($q$insert into public.photos (owner_id, path, position) values (%L, %L, 98)$q$, b, b::text || '/' || gen_random_uuid() || '.webp'),
    'exactly at the limit is still full', 'photo_limit');
  delete from public.photos where id = (select id from public.photos where owner_id = b limit 1);
  insert into public.photos (owner_id, path, position) values (b, b::text || '/' || gen_random_uuid() || '.webp', 97);
  perform t.ok((select count(*) from public.photos where owner_id = b) = 15, 'under the limit again, a photo can be added');

  perform t.as_admin();
end $$;
