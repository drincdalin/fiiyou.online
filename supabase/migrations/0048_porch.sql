-- 0048: the profile guestbook is now the Porch.
-- Only the visible title changes; the table, policies, notifications and card type stay `guestbook`.

update public.profile_cards
   set title = 'Porch'
 where type = 'guestbook' and title = 'Guestbook';

-- New accounts should start with the new name too.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare u text := lower(coalesce(new.raw_user_meta_data->>'username', ''));
begin
  if exists (select 1 from public.profiles where id = new.id) then return new; end if;
  if u !~ '^[a-z0-9_]{3,24}$' or exists (select 1 from public.profiles where username = u) then
    u := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, u, left(coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), u), 50));

  insert into public.profile_cards (profile_id, type, title, content, x, y, w, h, z, rotation) values
    (new.id, 'about',       'About me',   '{"body":""}',   20,  20, 460, 260, 1,  0),
    (new.id, 'top_friends', 'Top 8',      '{}',           500,  40, 480, 300, 2,  1.5),
    (new.id, 'gallery',     'Pics',       '{"images":[]}', 40, 300, 440, 280, 3, -1),
    (new.id, 'guestbook',   'Porch',      '{}',           520, 360, 460, 320, 4,  0.5);
  return new;
end $$;
