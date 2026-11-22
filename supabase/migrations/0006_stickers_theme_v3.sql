-- 0006: stickers, nested-radius theme keys (theme v3), music fix, bigger card limit.
-- Run after 0001-0005.
alter table public.profile_cards
  drop constraint profile_cards_type_check, drop constraint profile_cards_x_check,
  drop constraint profile_cards_y_check, drop constraint profile_cards_rotation_check;
alter table public.profile_cards
  add constraint profile_cards_type_check check (type in
    ('about','text','image','gallery','links','interests','music','top_friends','guestbook','sticker')),
  add constraint profile_cards_x_check check (x between -500 and 5000),
  add constraint profile_cards_y_check check (y between -500 and 5000),
  add constraint profile_cards_rotation_check check (rotation between -180 and 180);

create or replace function public.limit_cards_per_profile() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.profile_cards where profile_id = new.profile_id) >= 80 then
    raise exception 'card_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- empty music url (= not set yet) used to violate the check; now allowed
create or replace function public.is_valid_card_content(c jsonb) returns boolean
language plpgsql immutable as $$
declare el jsonb; s text;
begin
  if c is null or jsonb_typeof(c) <> 'object' then return false; end if;
  if length(c::text) > 8000 then return false; end if;
  if length(coalesce(c->>'body','')) > 3000 then return false; end if;

  if c ? 'images' then
    if jsonb_typeof(c->'images') <> 'array' or jsonb_array_length(c->'images') > 12 then return false; end if;
    for el in select value from jsonb_array_elements(c->'images') loop
      if jsonb_typeof(el) <> 'string' or not public.is_media_path(el #>> '{}') then return false; end if;
    end loop;
  end if;

  if c ? 'links' then
    if jsonb_typeof(c->'links') <> 'array' or jsonb_array_length(c->'links') > 20 then return false; end if;
    for el in select value from jsonb_array_elements(c->'links') loop
      if jsonb_typeof(el) <> 'object' then return false; end if;
      if coalesce(el->>'url','') !~ '^https?://[^[:space:]]+$' or length(el->>'url') > 500 then return false; end if;
      if length(coalesce(el->>'label','')) > 60 then return false; end if;
    end loop;
  end if;

  if c ? 'url' then
    if jsonb_typeof(c->'url') <> 'string' then return false; end if;
    if (c->>'url') <> '' and ((c->>'url') !~ '^https?://[^[:space:]]+$' or length(c->>'url') > 500) then return false; end if;
  end if;

  if c ? 'interests' then
    if jsonb_typeof(c->'interests') <> 'array' or jsonb_array_length(c->'interests') > 30 then return false; end if;
    for el in select value from jsonb_array_elements(c->'interests') loop
      if jsonb_typeof(el) <> 'string' or length(el #>> '{}') > 40 then return false; end if;
    end loop;
  end if;
  return true;
end $$;

create or replace function public.is_valid_theme(t jsonb) returns boolean
language plpgsql immutable as $$
declare k text; v jsonb; s text;
  allowed constant jsonb := '{
   "font":["default","endless","serif","sans","mono","pixel","verdana","comic"],
   "name_font":["default","endless","serif","sans","mono","pixel","verdana","comic"],
   "radius":["0","8","12","16","24","32"], "step":["4","8","12","16"],
   "border_width":["0","1","2","3","4"], "border_style":["solid","dashed","dotted","double"],
   "shadow":["none","soft","hard"], "frame_opacity":["0","25","50","70","85","100"],
   "card_opacity":["0","50","70","85","100"], "blur":["0","4","8","16"], "overlay":["0","20","40","60","80"],
   "font_size":["13","14","15","16","18"], "name_case":["upper","normal"],
   "layout":["side-left","side-right","single"], "sidebar":["160","190","240"], "card_gap":["8","16","24","32"],
   "bg_repeat":["repeat","repeat-x","repeat-y","no-repeat","cover"], "bg_fixed":["fixed","scroll"],
   "cursor":["default","crosshair","pointer","help"]}';
begin
  if t is null or jsonb_typeof(t) <> 'object' then return false; end if;
  if length(t::text) > 2048 then return false; end if;
  for k, v in select key, value from jsonb_each(t) loop
    if jsonb_typeof(v) <> 'string' then return false; end if;
    s := v #>> '{}';
    if k in ('bg_color','text_color','link_color','accent_color','border_color','card_color','frame_color') then
      if not public.is_hex_color(s) then return false; end if;
    elsif k = 'bg_image' then
      if not public.is_media_path(s) then return false; end if;
    elsif allowed ? k then
      if not ((allowed -> k) ? s) then return false; end if;
    else return false; end if;
  end loop;
  return true;
end $$;
grant execute on function public.is_valid_theme(jsonb), public.is_valid_card_content(jsonb) to authenticated;
