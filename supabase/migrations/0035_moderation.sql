-- =====================================================================
-- fiiyou 0035: moderation workflow.   Run once in the Supabase SQL editor (after 0034).
--
--  * Two staff tiers: ADMIN (existing: confirmed email in admin_emails) and MODERATOR (new: staff_roles).
--    Moderators can review reports and delete places / posts / comments. Only admins can ban, delete accounts,
--    verify people, clean storage or manage moderators.
--  * Reports gain a structured category + details, and can target a place.
--  * admin_delete_place(): removes ANY place, requires a reason, closes its open reports, writes deletion_log
--    (a snapshot, so a mistake can be undone by hand) and queues an email to the creator (moderation_outbox).
--  * Bans queue an email too. The Edge Function send-moderation-email (see supabase/functions) sends it through Gmail.
--
-- Why HARD delete: places has a unique index on osm_ref, so a soft-deleted row would block anyone from ever
-- re-adding that real-world place, and every read path (places_overview, export, RLS) would need a filter.
-- The snapshot in deletion_log gives you the "undo" without that cost.
--
-- Status names are kept as they are in the database: open = pending, reviewed = resolved, dismissed = dismissed.
-- =====================================================================

-- ---------- 1) roles ----------
create table if not exists public.staff_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('moderator')),
  granted_by uuid,
  created_at timestamptz not null default now()
);
alter table public.staff_roles enable row level security;       -- no policies: invisible to every client
revoke all on public.staff_roles from anon, authenticated;
-- Deliberately NOT a column on profiles: users can update their own profile row, a role column there is one policy mistake away
-- from self-promotion. This table has no policies at all, only the SECURITY DEFINER functions below can touch it.

create or replace function public.staff_role() returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then 'admin'
    when exists (select 1 from public.staff_roles s join auth.users u on u.id = s.user_id
                 where s.user_id = auth.uid() and u.email_confirmed_at is not null) then 'moderator'
  end
$$;
create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = public as $$ select public.staff_role() is not null $$;
create or replace function public.assert_moderator() returns void
language plpgsql stable security definer set search_path = public as $$
begin if public.staff_role() is null then raise exception 'forbidden' using errcode = '42501'; end if; end $$;

-- every existing admin_* function asserts admin BEFORE it calls log_admin(), so letting moderators through here is safe
create or replace function public.log_admin(a text, t text, d jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
begin perform public.assert_moderator(); insert into public.admin_actions (admin_id, action, target, details) values (auth.uid(), a, t, d); end $$;

create or replace function public.admin_set_moderator(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin perform public.assert_admin();
  if p_on then insert into public.staff_roles (user_id, role, granted_by) values (p_user, 'moderator', auth.uid()) on conflict (user_id) do nothing;
  else delete from public.staff_roles where user_id = p_user; end if;
  perform public.log_admin(case when p_on then 'add_moderator' else 'remove_moderator' end, p_user::text,
    (select jsonb_build_object('username', username) from public.profiles where id = p_user));
end $$;

-- ---------- 2) reports: places, categories ----------
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('profile','post','post_comment','wall_comment','place'));
alter table public.reports
  add column if not exists category    text check (category in ('spam','explicit','inaccurate_location','abuse','other')),
  add column if not exists details     text check (char_length(details) <= 500),
  add column if not exists resolved_by uuid,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution  text check (char_length(resolution) <= 300);

-- one open report per person per target (re-reporting the same thing only adds noise)
update public.reports set status = 'dismissed'
 where id in (select id from (select id, row_number() over (partition by reporter_id, target_type, target_id order by created_at) rn
                              from public.reports where status = 'open') x where rn > 1);
create unique index if not exists reports_one_open_per_reporter_target
  on public.reports (reporter_id, target_type, target_id) where status = 'open';
create index if not exists reports_target_idx on public.reports (target_type, target_id);
create index if not exists reports_status_created_idx on public.reports (status, created_at desc);

create or replace function public.submit_report(p_type text, p_id uuid, p_category text, p_details text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_details text := nullif(btrim(coalesce(p_details, '')), ''); v_owner uuid; v_new uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_category not in ('spam','explicit','inaccurate_location','abuse','other') then raise exception 'bad_category'; end if;
  if p_category = 'other' and v_details is null then raise exception 'details_required'; end if;
  if v_details is not null and char_length(v_details) > 500 then raise exception 'details_too_long'; end if;
  if p_type = 'place' then
    select created_by into v_owner from public.places where id = p_id;
    if not found then raise exception 'not_found'; end if;
    if v_owner = v_uid then raise exception 'cannot_report_own'; end if;
  elsif p_type = 'post' then
    select author_id into v_owner from public.posts where id = p_id;
    if not found then raise exception 'not_found'; end if;
  else raise exception 'bad_type'; end if;   -- profiles / comments keep using safety.report() until you want categories there too
  insert into public.reports (reporter_id, target_type, target_id, reason, category, details)
  values (v_uid, p_type, p_id, left(p_category || coalesce(': ' || v_details, ''), 500), p_category, v_details)
  returning id into v_new;                    -- the existing reports_rate trigger (10 an hour) still fires on this insert
  return v_new;
end $$;

-- moderators read reports. Same shape as before plus category / details / resolution, and a preview for places.
drop function if exists public.admin_reports(text, int);
create function public.admin_reports(p_status text default 'open', p_limit int default 50)
returns table (id uuid, target_type text, target_id uuid, reason text, status text, created_at timestamptz, reporter_username text, preview jsonb,
               category text, details text, resolution text, resolved_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin perform public.assert_moderator();
  if p_status not in ('open','reviewed','dismissed','all') then raise exception 'bad_status'; end if;
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
      when 'place' then (select jsonb_build_object('title', pl.name, 'body', pl.description, 'lat', pl.lat, 'lng', pl.lng,
                          'author', pa.username, 'author_id', pl.created_by, 'post_count', (select count(*) from public.posts po where po.place_id = pl.id))
                        from public.places pl left join public.profiles pa on pa.id = pl.created_by where pl.id = r.target_id)
    end,
    r.category, r.details, r.resolution, r.resolved_at
  from public.reports r left join public.profiles rp on rp.id = r.reporter_id
  where p_status = 'all' or r.status = p_status
  order by r.created_at desc limit least(greatest(p_limit, 1), 200);
end $$;

create or replace function public.admin_set_report(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin perform public.assert_moderator();
  if p_status not in ('open', 'reviewed', 'dismissed') then raise exception 'bad_status'; end if;
  update public.reports set status = p_status,
         resolved_by = case when p_status = 'open' then null else auth.uid() end,
         resolved_at = case when p_status = 'open' then null else now() end
   where id = p_id;
  perform public.log_admin('report_' || p_status, p_id::text);
end $$;

-- ---------- 3) deletion log + email outbox (both invisible to clients) ----------
create table if not exists public.deletion_log (
  id                bigint generated always as identity primary key,
  target_type       text not null default 'place',
  target_id         uuid not null,
  place_name        text, place_description text, lat double precision, lng double precision, osm_ref text,
  creator_id        uuid,                       -- no foreign key on purpose: the record must outlive the account
  creator_username  text,
  deleted_by        uuid not null,
  deleted_by_role   text not null check (deleted_by_role in ('admin','moderator')),
  reason_code       text not null check (reason_code in ('guidelines','inaccurate_location','spam','duplicate','custom')),
  reason_text       text check (char_length(reason_text) <= 300),
  reports_closed    int  not null default 0,
  notified          boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists deletion_log_created_idx on public.deletion_log (created_at desc);
alter table public.deletion_log enable row level security;
revoke all on public.deletion_log from anon, authenticated;

create table if not exists public.moderation_outbox (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('content_removed','account_banned')),
  to_email   text,                              -- wiped the moment the mail is sent (data minimisation)
  username   text,
  payload    jsonb not null default '{}'::jsonb,
  status     text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts   int  not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index if not exists moderation_outbox_status_idx on public.moderation_outbox (status, created_at);
alter table public.moderation_outbox enable row level security;
revoke all on public.moderation_outbox from anon, authenticated;   -- only the Edge Function (service role) reads it

-- ---------- 4) delete a place with a reason ----------
create or replace function public.admin_delete_place(p_id uuid, p_reason_code text, p_reason_text text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  pl public.places; v_role text; v_username text; v_email text; v_closed int;
  v_note text := nullif(btrim(coalesce(p_reason_text, '')), '');
begin
  perform public.assert_moderator();
  v_role := public.staff_role();
  if p_reason_code not in ('guidelines','inaccurate_location','spam','duplicate','custom') then raise exception 'bad_reason'; end if;
  if p_reason_code = 'custom' and (v_note is null or char_length(v_note) < 5) then raise exception 'reason_required'; end if;
  if v_note is not null and char_length(v_note) > 300 then raise exception 'reason_too_long'; end if;

  select * into pl from public.places where id = p_id for update;
  if not found then raise exception 'not_found'; end if;

  select username into v_username from public.profiles where id = pl.created_by;
  select email    into v_email    from auth.users      where id = pl.created_by;

  update public.reports set status = 'reviewed', resolved_by = auth.uid(), resolved_at = now(),
         resolution = left('Place removed (' || p_reason_code || ')', 300)
   where target_type = 'place' and target_id = p_id and status = 'open';
  get diagnostics v_closed = row_count;

  insert into public.deletion_log (target_id, place_name, place_description, lat, lng, osm_ref, creator_id, creator_username,
                                   deleted_by, deleted_by_role, reason_code, reason_text, reports_closed, notified)
  values (pl.id, pl.name, pl.description, pl.lat, pl.lng, pl.osm_ref, pl.created_by, v_username,
          auth.uid(), v_role, p_reason_code, v_note, v_closed, v_email is not null and pl.created_by is distinct from auth.uid());

  delete from public.places where id = p_id;     -- posts keep existing, they just lose the place tag (on delete set null)

  if v_email is not null and pl.created_by is distinct from auth.uid() then
    insert into public.moderation_outbox (kind, to_email, username, payload)
    values ('content_removed', v_email, v_username,
            jsonb_build_object('place_name', pl.name, 'place_description', pl.description, 'lat', pl.lat, 'lng', pl.lng,
                               'reason_code', p_reason_code, 'reason_text', v_note));
  end if;

  perform public.log_admin('delete_place', p_id::text,
          jsonb_build_object('place', pl.name, 'username', v_username, 'reason_code', p_reason_code, 'reports_closed', v_closed));
  return jsonb_build_object('closed_reports', v_closed, 'notified', v_email is not null and pl.created_by is distinct from auth.uid());
end $$;

create or replace function public.admin_deletion_log(p_limit int default 50)
returns table (created_at timestamptz, target_type text, place_name text, creator_username text, deleted_by_username text, deleted_by_role text,
               reason_code text, reason_text text, reports_closed int, notified boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin perform public.assert_moderator();
  return query select d.created_at, d.target_type, d.place_name, d.creator_username, p.username, d.deleted_by_role,
                      d.reason_code, d.reason_text, d.reports_closed, d.notified
  from public.deletion_log d left join public.profiles p on p.id = d.deleted_by
  order by d.created_at desc limit least(greatest(p_limit, 1), 200);
end $$;

-- ---------- 5) moderators may also remove posts and comments ----------
create or replace function public.admin_delete_post(p_id uuid) returns text language plpgsql security definer set search_path = public as $$
declare img text;
begin perform public.assert_moderator();
  select image_path into img from public.posts where id = p_id; delete from public.posts where id = p_id;
  perform public.log_admin('delete_post', p_id::text); return img;
end $$;
create or replace function public.admin_delete_comment(p_type text, p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin perform public.assert_moderator();
  if p_type = 'post_comment' then delete from public.post_comments where id = p_id;
  elsif p_type = 'wall_comment' then delete from public.wall_comments where id = p_id;
  else raise exception 'bad_type'; end if;
  perform public.log_admin('delete_' || p_type, p_id::text);
end $$;
drop policy if exists media_delete_admin on storage.objects;
drop policy if exists media_delete_staff on storage.objects;
create policy media_delete_staff on storage.objects for delete to authenticated using (bucket_id = 'media' and public.is_moderator());
-- audio stays admin-only (audio_delete_admin from 0015 is untouched)

-- admin_log: moderators see the audit trail too
create or replace function public.admin_log(p_limit int default 50) returns table (created_at timestamptz, admin_username text, action text, target text, details jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin perform public.assert_moderator();
  return query select a.created_at, p.username, a.action, a.target, a.details from public.admin_actions a left join public.profiles p on p.id = a.admin_id
  order by a.created_at desc limit least(greatest(p_limit, 1), 200);
end $$;

-- ---------- 6) bans: queue the notification BEFORE the account (and its email) disappears ----------
-- p_reason stays internal (stored with the hashed email). p_user_message is what the person is told.
drop function if exists public.admin_ban_user(uuid, text);
create function public.admin_ban_user(p_user uuid, p_reason text default null, p_user_message text default null) returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_email text; v_username text; v_msg text := nullif(btrim(coalesce(p_user_message, '')), '');
begin
  perform public.assert_admin();
  if p_user = auth.uid() then raise exception 'cannot_ban_self'; end if;
  if v_msg is not null and char_length(v_msg) > 500 then raise exception 'reason_too_long'; end if;
  select email into v_email from auth.users where id = p_user;
  if v_email is null then raise exception 'not_found'; end if;
  select username into v_username from public.profiles where id = p_user;
  insert into public.banned_emails (email_hash, reason, banned_by) values (public.email_fingerprint(v_email), p_reason, auth.uid())
    on conflict (email_hash) do nothing;
  insert into public.moderation_outbox (kind, to_email, username, payload)
    values ('account_banned', v_email, v_username, jsonb_build_object('reason_text', v_msg));
  perform public.log_admin('ban_user', p_user::text, jsonb_build_object('username', v_username));
  delete from auth.users where id = p_user;
end $$;

-- ---------- 7) grants (functions are executable by PUBLIC by default: lock every new one down explicitly) ----------
do $$
declare s text;
begin
  foreach s in array array[
    'public.staff_role()', 'public.is_moderator()', 'public.assert_moderator()', 'public.admin_set_moderator(uuid,boolean)',
    'public.submit_report(text,uuid,text,text)', 'public.admin_reports(text,int)', 'public.admin_delete_place(uuid,text,text)',
    'public.admin_deletion_log(int)', 'public.admin_ban_user(uuid,text,text)'
  ] loop
    execute format('revoke all on function %s from public, anon', s);
    execute format('grant execute on function %s to authenticated', s);
  end loop;
end $$;
