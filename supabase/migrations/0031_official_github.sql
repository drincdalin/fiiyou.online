-- 0031: the official fiiyou account shows its GitHub repository (commit count, contributors ranked by commits, latest commits) on its profile.
-- profiles.github_repo = 'owner/name' of a PUBLIC repo. Like is_official it can only be set by the dashboard / service role:
-- 0011 revoked table-wide UPDATE from clients and granted only a list of columns, and this column is not on that list.
-- Re-running is safe. If the official account signs up AFTER this ran, run the last statement again.

alter table public.profiles add column if not exists github_repo text;
alter table public.profiles drop constraint if exists profiles_github_repo_format;
alter table public.profiles add constraint profiles_github_repo_format
  check (github_repo is null or github_repo ~ '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$');

update public.profiles
   set github_repo = 'drincdalin/fiiyou.online'
 where id = (select id from auth.users where lower(email) = 'drinksvlog@gmail.com' limit 1);
