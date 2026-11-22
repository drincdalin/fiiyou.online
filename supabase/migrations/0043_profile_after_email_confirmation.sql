-- 0043: an account only becomes a person in the app once the email is confirmed.
--
-- Before: handle_new_user() ran the moment a row was inserted into auth.users, i.e. at sign-up. Anyone who typed an email (even someone
-- else's, even a typo) instantly had a profile, starter cards, a spot in Discover and Search, and a reserved username.
-- Now:    the profile is created when auth.users.email_confirmed_at is set (on the confirmation click), or at insert if the row is
--         already confirmed (confirmation switched off in the dashboard). Safe to run twice.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare u text := lower(coalesce(new.raw_user_meta_data->>'username', ''));
begin
  if exists (select 1 from public.profiles where id = new.id) then return new; end if;   -- never create twice
  if u !~ '^[a-z0-9_]{3,24}$' or exists (select 1 from public.profiles where username = u) then
    u := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, u, left(coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), u), 50));

  insert into public.profile_cards (profile_id, type, title, content, x, y, w, h, z, rotation) values
    (new.id, 'about',       'About me',   '{"body":""}',   20,  20, 460, 260, 1,  0),
    (new.id, 'top_friends', 'Top 8',      '{}',           500,  40, 480, 300, 2,  1.5),
    (new.id, 'gallery',     'Pics',       '{"images":[]}', 40, 300, 440, 280, 3, -1),
    (new.id, 'guestbook',   'Guestbook',  '{}',           520, 360, 460, 320, 4,  0.5);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row when (new.email_confirmed_at is not null) execute function public.handle_new_user();

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null) execute function public.handle_new_user();

-- A sign-up that is waiting for its confirmation email still holds its username for 24 hours, so two people cannot both be promised
-- the same name. p_email lets the SAME person try again (typo, lost email) without being told their own pending name is taken.
drop function if exists public.username_available(text);
create or replace function public.username_available(p_username text, p_email text default null) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(p_username) ~ '^[a-z0-9_]{3,24}$'
     and not exists (select 1 from public.profiles where username = lower(p_username))
     and not exists (select 1 from auth.users u
                     where u.email_confirmed_at is null and u.created_at > now() - interval '24 hours'
                       and lower(u.raw_user_meta_data->>'username') = lower(p_username)
                       and (p_email is null or lower(coalesce(u.email, '')) <> lower(p_email)))
$$;
revoke all on function public.username_available(text, text) from public;
grant execute on function public.username_available(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- OPTIONAL, run by hand after reading the preview. Sign-ups made BEFORE this migration that never confirmed still have a profile, so they
-- still show in Discover. Removing the profile is safe: the confirmation click recreates it (see on_auth_user_confirmed above).
--   preview:  select p.username, u.email, u.created_at from public.profiles p join auth.users u on u.id = p.id where u.email_confirmed_at is null;
--   remove :  delete from public.profiles where id in (select id from auth.users where email_confirmed_at is null);
-- Supabase never deletes unconfirmed accounts on its own. To clear stale ones (frees the email for a fresh sign-up):
--             delete from auth.users where email_confirmed_at is null and created_at < now() - interval '7 days';
