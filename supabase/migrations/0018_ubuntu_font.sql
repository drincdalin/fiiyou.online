-- 0018: the UI font moves from Endless to the Ubuntu Sans variable fonts. Font key 'endless' becomes 'ubuntu'.
-- Step 1: validators accept both keys while data is migrated.
create or replace function public.is_valid_theme(t jsonb) returns boolean
language plpgsql immutable as $$
declare k text; v jsonb; s text;
  allowed constant jsonb := '{
   "font":["default","endless","ubuntu","serif","sans","mono","pixel","verdana","comic"],
   "name_font":["default","endless","ubuntu","serif","sans","mono","pixel","verdana","comic"],
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
create or replace function public.is_valid_custom_css(r jsonb) returns boolean
language plpgsql immutable as $$
declare rule jsonb; k text; v jsonb;
  sels constant text[] := array['page','frame','side','avatar','nameplate','player','cards','card','cardtitle','gallery','tags','link'];
  hex constant text := '^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$';
  px48 constant text := '^(0|[1-9]|[1-3][0-9]|4[0-8])px$';
  props constant jsonb := jsonb_build_object(
    'color', hex, 'background-color', hex, 'border-color', hex,
    'border-width', '^[0-8]px$', 'border-style', '^(none|solid|dashed|dotted|double)$',
    'border-radius', px48, 'padding', px48, 'font-size', '^(1[0-9]|2[0-9]|3[0-2])px$',
    'font-weight', '^(400|500|600|700|800)$', 'letter-spacing', '^(-1|[0-6])px$',
    'text-transform', '^(none|uppercase|lowercase|capitalize)$', 'text-align', '^(left|center|right)$',
    'opacity', '^(0\.[1-9]|1)$', 'transform', '^rotate\((-?[0-9]|-?1[0-9]|-?20)deg\)$',
    'box-shadow', '^(none|soft|hard|glow)$', 'filter', '^(none|grayscale|sepia|blur)$',
    'font-family', '^(sans|serif|mono|pixel|verdana|comic|endless|ubuntu)$');
begin
  if r is null or jsonb_typeof(r) <> 'array' or jsonb_array_length(r) > 40 or length(r::text) > 6000 then return false; end if;
  for rule in select value from jsonb_array_elements(r) loop
    if jsonb_typeof(rule) <> 'object' or exists (select 1 from jsonb_object_keys(rule) kk where kk not in ('s','p')) then return false; end if;
    if coalesce(jsonb_typeof(rule->'s'), '') <> 'string' or not ((rule->>'s') = any(sels)) then return false; end if;
    if coalesce(jsonb_typeof(rule->'p'), '') <> 'object' or (select count(*) from jsonb_object_keys(rule->'p')) > 12 then return false; end if;
    for k, v in select key, value from jsonb_each(rule->'p') loop
      if not (props ? k) or jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ (props->>k) then return false; end if;
    end loop;
  end loop;
  return true;
end $$;
-- Step 2: migrate stored values.
update public.profiles set theme = (select jsonb_object_agg(e.key, case when e.key in ('font','name_font') and e.value = '"endless"'::jsonb then '"ubuntu"'::jsonb else e.value end)
                                    from jsonb_each(theme) e) where theme::text like '%"endless"%';
update public.profiles set custom_css = replace(custom_css::text, '"endless"', '"ubuntu"')::jsonb where custom_css::text like '%"endless"%';
-- Step 3: validators accept only the new key.
create or replace function public.is_valid_theme(t jsonb) returns boolean
language plpgsql immutable as $$
declare k text; v jsonb; s text;
  allowed constant jsonb := '{
   "font":["default","ubuntu","serif","sans","mono","pixel","verdana","comic"],
   "name_font":["default","ubuntu","serif","sans","mono","pixel","verdana","comic"],
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
create or replace function public.is_valid_custom_css(r jsonb) returns boolean
language plpgsql immutable as $$
declare rule jsonb; k text; v jsonb;
  sels constant text[] := array['page','frame','side','avatar','nameplate','player','cards','card','cardtitle','gallery','tags','link'];
  hex constant text := '^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$';
  px48 constant text := '^(0|[1-9]|[1-3][0-9]|4[0-8])px$';
  props constant jsonb := jsonb_build_object(
    'color', hex, 'background-color', hex, 'border-color', hex,
    'border-width', '^[0-8]px$', 'border-style', '^(none|solid|dashed|dotted|double)$',
    'border-radius', px48, 'padding', px48, 'font-size', '^(1[0-9]|2[0-9]|3[0-2])px$',
    'font-weight', '^(400|500|600|700|800)$', 'letter-spacing', '^(-1|[0-6])px$',
    'text-transform', '^(none|uppercase|lowercase|capitalize)$', 'text-align', '^(left|center|right)$',
    'opacity', '^(0\.[1-9]|1)$', 'transform', '^rotate\((-?[0-9]|-?1[0-9]|-?20)deg\)$',
    'box-shadow', '^(none|soft|hard|glow)$', 'filter', '^(none|grayscale|sepia|blur)$',
    'font-family', '^(sans|serif|mono|pixel|verdana|comic|ubuntu)$');
begin
  if r is null or jsonb_typeof(r) <> 'array' or jsonb_array_length(r) > 40 or length(r::text) > 6000 then return false; end if;
  for rule in select value from jsonb_array_elements(r) loop
    if jsonb_typeof(rule) <> 'object' or exists (select 1 from jsonb_object_keys(rule) kk where kk not in ('s','p')) then return false; end if;
    if coalesce(jsonb_typeof(rule->'s'), '') <> 'string' or not ((rule->>'s') = any(sels)) then return false; end if;
    if coalesce(jsonb_typeof(rule->'p'), '') <> 'object' or (select count(*) from jsonb_object_keys(rule->'p')) > 12 then return false; end if;
    for k, v in select key, value from jsonb_each(rule->'p') loop
      if not (props ? k) or jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ (props->>k) then return false; end if;
    end loop;
  end loop;
  return true;
end $$;
grant execute on function public.is_valid_theme(jsonb), public.is_valid_custom_css(jsonb) to authenticated;
