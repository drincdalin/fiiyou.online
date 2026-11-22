-- 0013: safe custom styling. Profiles store a LIST OF RULES, never CSS text: each rule is
-- {"s": <whitelisted element key>, "p": {<whitelisted property>: <value matching a strict pattern>}}.
-- No url(), @import, expression(), escapes, positioning, z-index or free text can ever be stored.
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
    'font-family', '^(sans|serif|mono|pixel|verdana|comic|endless)$');
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
alter table public.profiles add column custom_css jsonb not null default '[]'::jsonb check (public.is_valid_custom_css(custom_css));
grant update (custom_css) on public.profiles to authenticated;
grant execute on function public.is_valid_custom_css(jsonb) to authenticated;
