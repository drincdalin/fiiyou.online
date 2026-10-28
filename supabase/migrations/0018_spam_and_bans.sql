-- =====================================================================
-- fiiyou: spam protection + email bans.   Run once in the Supabase SQL editor.
--
-- Why SQL: the app talks to Supabase straight from the browser, so anything
-- enforced only in JS can be skipped by calling the API directly. These rules
-- live in the database and cannot be bypassed from the client.
--
-- ASSUMPTIONS (change if your schema differs):
--   * posts, post_comments, wall_comments each have: author_id uuid, body text, created_at timestamptz
--   * public.profiles has: id uuid, is_official boolean
--   * public.is_admin() returns true for you / your admins. If your admin check has another
--     name (the one adminApi.isAdmin() calls), replace it in admin_ban_user / admin_unban_email below.
--   * You may already have a rate limiter (the app already handles a 'rate_limit' error).
--     To see what exists:  select tgname, tgrelid::regclass from pg_trigger where not tgisinternal;
--     The guard below is additive: if both fire, the stricter one wins.
--
-- Error codes raised (the UI maps them to friendly messages):
--   rate_limit | spam_duplicate | spam_links | banned
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) SPAM GUARD  (posts, post_comments, wall_comments)
-- ---------------------------------------------------------------------

-- Who skips the guard. Verified/official accounts by default; swap in your own rule if you want.
create or replace function public.spam_exempt(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_official from public.profiles where id = p_user), false);
$$;

-- Indexes so the "how many did this person post lately" count stays cheap.
create index if not exists posts_author_created_idx         on public.posts         (author_id, created_at desc);
create index if not exists post_comments_author_created_idx on public.post_comments (author_id, created_at desc);
create index if not exists wall_comments_author_created_idx on public.wall_comments (author_id, created_at desc);

-- One trigger function for all three tables. Arguments (in order):
--   short_n, short_secs   at most short_n inserts per short_secs        (burst limit)
--   long_n,  long_secs    at most long_n  inserts per long_secs         (daily limit)
--   links_new, links_all  max links per message for accounts < 24h old / for everyone
-- Accounts younger than 24h get half of both limits.
create or replace function public.spam_guard() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  short_n int; short_s int; long_n int; long_s int; links_new int; links_all int;
  v_created timestamptz; v_new boolean; v_cnt int; v_dup boolean; v_links int; v_max int; v_body text;
begin
  if public.spam_exempt(new.author_id) then return new; end if;

  short_n := tg_argv[0]::int; short_s := tg_argv[1]::int; long_n := tg_argv[2]::int; long_s := tg_argv[3]::int;
  links_new := tg_argv[4]::int; links_all := tg_argv[5]::int;
  v_body := btrim(coalesce(new.body, ''));

  select created_at into v_created from auth.users where id = new.author_id;
  v_new := v_created is null or v_created > now() - interval '1 day';
  if v_new then short_n := greatest(1, short_n / 2); long_n := greatest(2, long_n / 2); end if;

  -- burst limit
  execute format('select count(*) from public.%I where author_id = $1 and created_at > now() - make_interval(secs => $2)', tg_table_name)
    into v_cnt using new.author_id, short_s;
  if v_cnt >= short_n then raise exception 'rate_limit'; end if;

  -- daily limit
  execute format('select count(*) from public.%I where author_id = $1 and created_at > now() - make_interval(secs => $2)', tg_table_name)
    into v_cnt using new.author_id, long_s;
  if v_cnt >= long_n then raise exception 'rate_limit'; end if;

  -- same text again within the hour (copy-paste spam). Very short messages ("lol", "hi") are allowed.
  if length(v_body) >= 10 then
    execute format('select exists (select 1 from public.%I where author_id = $1 and lower(btrim(body)) = lower($2) and created_at > now() - interval ''1 hour'')', tg_table_name)
      into v_dup using new.author_id, v_body;
    if v_dup then raise exception 'spam_duplicate'; end if;
  end if;

  -- links: http(s)://, www., or a bare domain with a path like bit.ly/abc
  select count(*) into v_links
  from regexp_matches(v_body, '(https?://|www\.|[a-z0-9-]+\.(com|net|org|info|xyz|top|ru|ro|io|ly|me|co|gg)/)', 'gi');
  v_max := case when v_new then links_new else links_all end;      -- (kept out of the IF: plpgsql would stop at the CASE's THEN)
  if v_links > v_max then raise exception 'spam_links'; end if;

  return new;
end $$;

--                                       short_n short_s  long_n long_s  links_new links_all
drop trigger if exists spam_guard on public.posts;
create trigger spam_guard         before insert on public.posts         for each row execute function public.spam_guard(4,  300,  25,  86400, 1, 3);
drop trigger if exists spam_guard on public.post_comments;
create trigger spam_guard         before insert on public.post_comments for each row execute function public.spam_guard(8,  120, 150,  86400, 0, 2);
drop trigger if exists spam_guard on public.wall_comments;
create trigger spam_guard         before insert on public.wall_comments for each row execute function public.spam_guard(5,  300,  40,  86400, 0, 2);


-- ---------------------------------------------------------------------
-- 2) EMAIL BANS
-- ---------------------------------------------------------------------

-- We keep only a hash of the email, not the address itself.
create table if not exists public.banned_emails (
  email_hash text primary key,
  reason     text,
  banned_by  uuid,
  banned_at  timestamptz not null default now()
);
alter table public.banned_emails enable row level security;       -- no policies = nobody reads it through the API
revoke all on public.banned_emails from anon, authenticated;

-- Normalises an email so trivial aliases map to the same fingerprint:
--   Name+anything@x.com -> name@x.com ;  j.o.h.n@gmail.com -> john@gmail.com ; googlemail.com -> gmail.com
create or replace function public.email_fingerprint(p_email text) returns text
language plpgsql immutable as $$
declare e text := lower(btrim(coalesce(p_email, ''))); l text; d text;
begin
  l := split_part(split_part(e, '@', 1), '+', 1); d := split_part(e, '@', 2);
  if d in ('gmail.com', 'googlemail.com') then l := replace(l, '.', ''); d := 'gmail.com'; end if;
  return encode(sha256(convert_to(l || '@' || d, 'utf8')), 'hex');
end $$;

-- Used by the sign-up / sign-in screens so they can show the "you are banned" page.
-- (The trigger below is the real enforcement; this is only for a nice message.)
create or replace function public.email_banned(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.banned_emails where email_hash = public.email_fingerprint(p_email));
$$;
grant execute on function public.email_banned(text) to anon, authenticated;

-- Real enforcement: nobody can create an auth user with a banned email, whatever client they use.
-- (Supabase reports this to the client as "Database error saving new user"; the app re-checks email_banned() to show the right page.)
create or replace function public.block_banned_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null and exists (select 1 from public.banned_emails where email_hash = public.email_fingerprint(new.email)) then
    raise exception 'banned';
  end if;
  return new;
end $$;
drop trigger if exists block_banned_signup on auth.users;
create trigger block_banned_signup before insert on auth.users for each row execute function public.block_banned_signup();

-- Admin action: remember the email as banned, then delete the account (cascades like delete_my_account does).
create or replace function public.admin_ban_user(p_user uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_email text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then raise exception 'cannot_ban_self'; end if;
  select email into v_email from auth.users where id = p_user;
  if v_email is null then raise exception 'not_found'; end if;
  insert into public.banned_emails (email_hash, reason, banned_by) values (public.email_fingerprint(v_email), p_reason, auth.uid())
    on conflict (email_hash) do nothing;
  delete from auth.users where id = p_user;
end $$;
revoke execute on function public.admin_ban_user(uuid, text) from public, anon;
grant  execute on function public.admin_ban_user(uuid, text) to authenticated;       -- the function itself checks is_admin()

-- Undo a ban (mistakes happen).
create or replace function public.admin_unban_email(p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.banned_emails where email_hash = public.email_fingerprint(p_email);
end $$;
revoke execute on function public.admin_unban_email(text) from public, anon;
grant  execute on function public.admin_unban_email(text) to authenticated;
