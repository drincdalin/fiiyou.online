-- 0032: like / block rate limits, spam_exempt closed to the API.
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); ids uuid[]; i int; ok boolean := false;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'h32a@t.t', '{"username":"h32a","display_name":"H A"}'), (b, 'h32b@t.t', '{"username":"h32b","display_name":"H B"}');
  update auth.users set created_at = now() - interval '30 days' where id in (a, b);
  perform t.as_admin();
  -- 160 posts by b, put in without the per-minute post limit getting in the way
  set local session_replication_role = replica;
  insert into public.posts (author_id, kind, body, visibility, created_at)
    select b, 'status', 'p' || g, 'public', now() - interval '3 days' - (g || ' minutes')::interval from generate_series(1, 160) g;
  set local session_replication_role = origin;
  select array_agg(id order by created_at) into ids from public.posts where author_id = b;
  perform t.as_user(a);
  for i in 1..150 loop insert into public.post_likes (post_id, user_id) values (ids[i], a); end loop;
  perform t.ok((select count(*) from public.post_likes where user_id = a) = 150, '150 likes in an hour are allowed');
  begin insert into public.post_likes (post_id, user_id) values (ids[151], a); ok := false;
  exception when others then ok := sqlerrm = 'rate_limit'; end;
  perform t.ok(ok, 'the 151st like in an hour is refused with rate_limit');
  perform t.as_admin();
  perform t.ok(not has_function_privilege('authenticated', 'public.spam_exempt(uuid)', 'execute'), 'spam_exempt() cannot be called through the API');
  perform t.ok(not has_function_privilege('anon', 'public.spam_exempt(uuid)', 'execute'), 'spam_exempt() cannot be called by the public key');
end $$;

-- 0033: the signed-out role can read places and call two functions, nothing else
do $$
declare ok boolean; n int;
begin
  perform t.as_admin();
  create table public.zz_later (id int);   -- a table added later starts closed to signed-out visitors
  perform t.ok(not has_table_privilege('anon', 'public.zz_later', 'select'), 'a table created later is not readable by the public key');
  perform t.ok((select relrowsecurity from pg_class where oid = 'public.zz_later'::regclass) is not null, 'sanity: the new table exists');
  drop table public.zz_later;
  perform t.ok(has_table_privilege('anon', 'public.localities', 'select'), 'the public key can read places');
  perform t.ok(not has_table_privilege('anon', 'public.profiles', 'select'), 'the public key cannot read profiles');
  perform t.ok(not has_table_privilege('anon', 'public.posts', 'insert'), 'the public key cannot write posts');
  perform t.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity), 'every public table has row level security');
  perform t.ok(has_function_privilege('anon', 'public.email_banned(text)', 'execute') and has_function_privilege('anon', 'public.username_available(text)', 'execute'), 'sign-up functions stay callable signed out');
  perform t.ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' and p.proname not in ('email_banned', 'username_available') and has_function_privilege('anon', p.oid, 'execute')) = 0, 'no other function is callable by the public key');
  perform t.ok(has_function_privilege('authenticated', 'public.username_available(text)', 'execute'), 'signed-in people can still call functions');
  perform t.ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('trending_tags', 'search_all') and has_function_privilege('authenticated', p.oid, 'execute')) >= 1, 'signed-in people keep the search / trending functions');
  perform t.as_user(gen_random_uuid());
  begin execute 'set local role anon'; perform 1 from public.profiles limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  perform t.ok(ok, 'selecting profiles as the public key is refused');
end $$;
