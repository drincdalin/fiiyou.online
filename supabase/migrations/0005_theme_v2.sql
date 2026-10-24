-- 0005: richer themes (card color, radius, overlay, name font, Endless font).
-- Safe to run on top of 0001-0004 (replaces the validator in place).
create or replace function public.is_valid_theme(t jsonb) returns boolean
language plpgsql immutable as $$
declare k text; v jsonb; s text;
begin
  if t is null or jsonb_typeof(t) <> 'object' then return false; end if;
  if length(t::text) > 2048 then return false; end if;
  for k, v in select key, value from jsonb_each(t) loop
    s := v #>> '{}';
    if jsonb_typeof(v) <> 'string' then return false; end if;
    case k
      when 'bg_color','text_color','link_color','accent_color','border_color','card_color' then
        if not public.is_hex_color(s) then return false; end if;
      when 'bg_image' then
        if not public.is_media_path(s) then return false; end if;
      when 'bg_repeat' then
        if s not in ('repeat','repeat-x','repeat-y','no-repeat','cover') then return false; end if;
      when 'font','name_font' then
        if s not in ('default','endless','serif','sans','mono','pixel','verdana','comic') then return false; end if;
      when 'radius' then
        if s not in ('0','2','4','8','12','20') then return false; end if;
      when 'overlay' then
        if s not in ('0','20','40','60','80') then return false; end if;
      when 'cursor' then
        if s not in ('default','crosshair','pointer','help') then return false; end if;
      else return false;
    end case;
  end loop;
  return true;
end $$;
grant execute on function public.is_valid_theme(jsonb) to authenticated;
