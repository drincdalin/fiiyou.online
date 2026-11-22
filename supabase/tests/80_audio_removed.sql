-- 0039: audio uploads are gone. Profile music is a YouTube link only; the audio bucket can no longer be read or written, only emptied.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'au_a@t.t', '{"username":"aua","display_name":"AU A"}'), (b, 'au_b@t.t', '{"username":"aub","display_name":"AU B"}');
  perform t.as_user(a);
  perform t.fails(format($q$update public.profiles set music = '{"audio":"%s/x.mp3","title":"t"}' where id = '%s'$q$, a, a), 'the audio key is rejected', 'check constraint');
  perform t.fails(format($q$update public.profiles set music = '{"url":"https://example.com/track.mp3"}' where id = '%s'$q$, a), 'a direct audio link is rejected', 'check constraint');
  perform t.fails(format($q$update public.profiles set music = '{"url":"https://youtube.com.evil.test/watch?v=abcdefghijk"}' where id = '%s'$q$, a), 'a look-alike domain is rejected', 'check constraint');
  update public.profiles set music = '{"url":"https://www.youtube.com/watch?v=abcdefghijk","title":"t","artist":"a"}' where id = a;
  perform t.ok((select music->>'title' from public.profiles where id = a) = 't', 'a YouTube link is saved');
  update public.profiles set music = '{"url":"https://youtu.be/abcdefghijk"}' where id = a;
  perform t.ok((select music->>'url' from public.profiles where id = a) = 'https://youtu.be/abcdefghijk', 'a youtu.be link is saved');
  update public.profiles set music = '{}' where id = a;
  perform t.ok((select music from public.profiles where id = a) = '{}'::jsonb, 'music can be cleared');

  perform t.as_admin();
  perform t.ok(not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                            and policyname in ('audio_read', 'audio_insert_own', 'audio_update_own')), 'nobody can read, upload or replace audio files');
  perform t.ok(exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'audio_delete_own'), 'people can still delete their own old audio files');
  perform t.ok(exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'audio_delete_admin'), 'admins can still delete old audio files');
end $$;
