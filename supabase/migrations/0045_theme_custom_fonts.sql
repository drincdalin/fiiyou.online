-- 0045: the theme validator finally accepts custom fonts.
--
-- 0010 added the `fonts` bucket, `is_valid_font_path()` and the theme value 'custom', but its
-- section 3 says the validator itself was never rewritten ("I could not see is_valid_theme()").
-- 0018 then re-created the validator without 'custom' and without the `font_file` key, so every
-- profile that uses an uploaded font failed `profiles_theme_check` — both on import and on save.
--
-- This is the function the production project actually runs. It is a superset of 0018:
--   * `font` / `name_font` accept 'custom'
--   * `font_file` is validated with public.is_valid_font_path()
--   * metadata keys `id` / `name` from presets are ignored
--   * the ranges the customizer exposes are allowed: radius 4..32, blur 2..20,
--     overlay 35/55/82/85, card_gap 12..36, step 10, card_opacity 58/88,
--     frame_opacity 45/58/88/92/94/95
--
-- Safe to re-run.

create or replace function public.is_valid_theme(t jsonb) returns boolean
language plpgsql immutable as $$
declare k text; v jsonb; s text;
  allowed constant jsonb := '{
   "font":["default","ubuntu","serif","sans","mono","pixel","verdana","comic","custom"],
   "name_font":["default","ubuntu","serif","sans","mono","pixel","verdana","comic","custom"],
   "radius":["0","4","6","8","10","12","14","16","18","20","24","28","32"], "step":["4","8","10","12","16"],
   "border_width":["0","1","2","3","4"], "border_style":["solid","dashed","dotted","double"],
   "shadow":["none","soft","hard"], "frame_opacity":["0","25","45","50","58","60","70","80","85","88","92","94","95","100"],
   "card_opacity":["0","50","58","70","85","88","100"], "blur":["0","2","4","6","8","16","20"], "overlay":["0","20","35","40","50","55","60","70","80","82","85","100"],
   "font_size":["13","14","15","16","18"], "name_case":["upper","normal"],
   "layout":["side-left","side-right","single"], "sidebar":["160","190","240"], "card_gap":["8","12","14","16","20","22","24","26","28","30","32","36"],
   "bg_repeat":["repeat","repeat-x","repeat-y","no-repeat","cover"], "bg_fixed":["fixed","scroll"],
   "cursor":["default","crosshair","pointer","help"]}';
begin
  if t is null or jsonb_typeof(t) <> 'object' then return false; end if;
  if length(t::text) > 2048 then return false; end if;
  for k, v in select key, value from jsonb_each(t) loop
    -- presets may carry their own id / name; they are metadata, not styling
    if k in ('id','name') then continue; end if;

    if jsonb_typeof(v) <> 'string' then return false; end if;
    s := v #>> '{}';
    if k in ('bg_color','text_color','link_color','accent_color','border_color','card_color','frame_color') then
      if not public.is_hex_color(s) then return false; end if;
    elsif k = 'bg_image' then
      if not public.is_media_path(s) then return false; end if;
    elsif k = 'font_file' then
      if not public.is_valid_font_path(s) then return false; end if;
    elsif allowed ? k then
      if not ((allowed -> k) ? s) then return false; end if;
    else return false; end if;
  end loop;
  return true;
end $$;
