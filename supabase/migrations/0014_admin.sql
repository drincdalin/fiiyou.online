-- 0014: admin panel backend. Admin = a CONFIRMED sign-in email listed in public.admin_emails.
-- The list is not readable by any client; only the SECURITY DEFINER functions below can see it.
-- Add yourself once, from the SQL Editor (kept out of the repo on purpose):
--   insert into public.admin_emails (email) values ('you@example.com');
create table public.admin_emails (email text primary key check (email = lower(email)));
alter table public.admin_emails enable row level security;          -- no policies: invisible to clients
create table public.admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid, action text not null, target text, details jsonb, created_at timestamptz not null default now());
alter table public.admin_actions enable row level security;         -- no policies: read through admin_log()

create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from auth.users u join public.admin_emails a on a.email = lower(u.email)
                 where u.id = auth.uid() and u.email_confirmed_at is not null)
$$;
create function public.assert_admin() returns void language plpgsql stable security definer set search_path = public as $$
begin if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if; end $$;
create function public.log_admin(a text, t text, d jsonb default null) returns void language plpgsql security definer set search_path = public as $$
begin perform public.assert_admin(); insert into public.admin_actions (admin_id, action, target, details) values (auth.uid(), a, t, d); end $$;

create function public.admin_stats() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin perform public.assert_admin();
  return jsonb_build_object('members', (select count(*) from public.profiles), 'verified', (select count(*) from public.profiles where is_official),
    'posts', (select count(*) from public.posts), 'photos', (select count(*) from public.photos), 'places', (select count(*) from public.places),
    'open_reports', (select count(*) from public.reports where status = 'open'));
end $$;

create function public.admin_reports(p_status text default 'open', p_limit int default 50)
returns table (id uuid, target_type text, target_id uuid, reason text, status text, created_at timestamptz, reporter_username text, preview jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin perform public.assert_admin();
  return query
  select r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at, rp.username,
    case r.target_type
      when 'post' then (select jsonb_build_object('body', po.body, 'title', po.title, 'image_path', po.image_path, 'author', pa.username, 'author_id', po.author_id)
                        from public.posts po join public.profiles pa on pa.id = po.author_id where po.id = r.target_id)
      when 'post_comment' then (select jsonb_build_object('body', c.body, 'author', pa.username, 'author_id', c.author_id)
                        from public.post_comments c join public.profiles pa on pa.id = c.author_id where c.id = r.target_id)
      when 'wall_comment' then (select jsonb_build_object('body', w.body, 'author', pa.username, 'author_id', w.author_id)
                        from public.wall_comments w join public.profiles pa on pa.id = w.author_id where w.id = r.target_id)
      when 'profile' then (select jsonb_build_object('author', p.username, 'display_name', p.display_name, 'avatar_path', p.avatar_path, 'verified', p.is_official, 'author_id', p.id)
                        from public.profiles p where p.id = r.target_id)
    end
  from public.reports r left join public.profiles rp on rp.id = r.reporter_id
  where r.status = p_status order by r.created_at desc limit least(greatest(p_limit, 1), 200);
end $$;

create function public.admin_set_report(p_id uuid, p_status text) returns void language plpgsql security definer set search_path = public as $$
begin perform public.assert_admin();
  if p_status not in ('open', 'reviewed', 'dismissed') then raise exception 'bad_status'; end if;
  update public.reports set status = p_status where id = p_id; perform public.log_admin('report_' || p_status, p_id::text);
end $$;

-- returns the image path so the app can delete the file through the Storage API (SQL cannot)
create function public.admin_delete_post(p_id uuid) returns text language plpgsql security definer set search_path = public as $$
declare img text;
begin perform public.assert_admin();
  select image_path into img from public.posts where id = p_id; delete from public.posts where id = p_id;
  perform public.log_admin('delete_post', p_id::text); return img;
end $$;

create function public.admin_delete_comment(p_type text, p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin perform public.assert_admin();
  if p_type = 'post_comment' then delete from public.post_comments where id = p_id;
  elsif p_type = 'wall_comment' then delete from public.wall_comments where id = p_id;
  else raise exception 'bad_type'; end if;
  perform public.log_admin('delete_' || p_type, p_id::text);
end $$;

create function public.admin_set_verified(p_profile uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin perform public.assert_admin();
  update public.profiles set is_official = p_on where id = p_profile;
  perform public.log_admin(case when p_on then 'verify' else 'unverify' end, p_profile::text);
end $$;

create function public.admin_search_users(p_q text default '', p_limit int default 30)
returns table (id uuid, username text, display_name text, avatar_path text, verified boolean, created_at timestamptz, post_count bigint, open_reports bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin perform public.assert_admin();
  return query
  select p.id, p.username, p.display_name, p.avatar_path, p.is_official, p.created_at,
         (select count(*) from public.posts po where po.author_id = p.id),
         (select count(*) from public.reports r where r.status = 'open' and r.target_type = 'profile' and r.target_id = p.id)
  from public.profiles p
  where length(trim(p_q)) = 0 or p.username ilike '%' || replace(replace(replace(lower(trim(p_q)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
     or p.display_name ilike '%' || replace(replace(replace(lower(trim(p_q)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by p.created_at desc limit least(greatest(p_limit, 1), 100);
end $$;

-- Removes the account and (by cascade) everything it owns. The app deletes the person's files first.
create function public.admin_delete_user(p_user uuid) returns void language plpgsql security definer set search_path = public as $$
begin perform public.assert_admin();
  if p_user = auth.uid() then raise exception 'cannot_delete_self'; end if;
  perform public.log_admin('delete_user', p_user::text, (select jsonb_build_object('username', username) from public.profiles where id = p_user));
  delete from auth.users where id = p_user;
end $$;

-- every file path the database still references (for the orphan scan)
create function public.admin_referenced_paths() returns table (bucket text, path text) language plpgsql stable security definer set search_path = public as $$
begin perform public.assert_admin();
  return query
    select 'media'::text, p.avatar_path from public.profiles p where p.avatar_path is not null
    union select 'media'::text, p.theme->>'bg_image' from public.profiles p where p.theme ? 'bg_image'
    union select 'media'::text, p.music->>'cover' from public.profiles p where p.music ? 'cover'
    union select 'audio'::text, p.music->>'audio' from public.profiles p where p.music ? 'audio'
    union select 'media'::text, i from public.profile_cards c, jsonb_array_elements_text(c.content->'images') i where jsonb_typeof(c.content->'images') = 'array'
    union select 'media'::text, ph.path from public.photos ph
    union select 'media'::text, po.image_path from public.posts po where po.image_path is not null;
end $$;

create function public.admin_log(p_limit int default 50) returns table (created_at timestamptz, admin_username text, action text, target text, details jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin perform public.assert_admin();
  return query select a.created_at, p.username, a.action, a.target, a.details from public.admin_actions a left join public.profiles p on p.id = a.admin_id
  order by a.created_at desc limit least(greatest(p_limit, 1), 200);
end $$;

-- admins may delete other people's files (moderation + orphan clean-up) through the Storage API
create policy media_delete_admin on storage.objects for delete to authenticated using (bucket_id = 'media' and public.is_admin());
create policy audio_delete_admin on storage.objects for delete to authenticated using (bucket_id = 'audio' and public.is_admin());

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
grant execute on function public.username_available(text) to anon;
