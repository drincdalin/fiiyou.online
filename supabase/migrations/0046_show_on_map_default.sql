-- 0046: new accounts are shown on the friends map by default.
--
-- 0001 declared `show_on_map` with a default of false. The map is still friends-only and
-- still opt-out from the profile customizer, but a new account now starts with it on.
-- Existing rows are untouched: anyone who turned it off keeps it off.
--
-- handle_new_user() (0043) inserts only id, username and display_name, so this default applies.
-- Safe to re-run.

alter table public.profiles alter column show_on_map set default true;
