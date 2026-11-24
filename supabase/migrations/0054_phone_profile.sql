-- 0054: per-device profile customisation — a profile can look tailored on a PHONE,
-- independently of the desktop. Two optional, default-empty columns:
--   profile_cards.phone_layout : phone order / visibility / size for flow cards,
--                                phone pin + vertical offset + scale for stickers.
--   profiles.phone_theme       : the small set of theme keys that may differ on a phone.
-- Both default to '{}', which means "render exactly as before" (desktop data, stacked
-- flow order). Existing profiles are untouched until they edit their phone layout, and
-- no data is changed by this migration. See docs/PHONE_PROFILE.md.

-- ---- phone theme: only bg_image and font_size may differ. The accent is SHARED. ----
create or replace function public.is_valid_phone_theme(t jsonb) returns boolean
language plpgsql immutable as $$
declare k text; v jsonb; s text;
begin
  if t is null or jsonb_typeof(t) <> 'object' then return false; end if;
  if length(t::text) > 512 then return false; end if;
  for k, v in select key, value from jsonb_each(t) loop
    if jsonb_typeof(v) <> 'string' then return false; end if;
    s := v #>> '{}';
    if k = 'bg_image' then
      if not public.is_media_path(s) then return false; end if;
    elsif k = 'font_size' then
      if s not in ('13','14','15','16','18') then return false; end if;
    else
      return false;
    end if;
  end loop;
  return true;
end $$;

-- ---- phone card layout: shape depends on the card's type ----
create or replace function public.is_valid_phone_layout(p_type text, c jsonb) returns boolean
language plpgsql immutable as $$
declare k text; v jsonb; n numeric;
begin
  if c is null or jsonb_typeof(c) <> 'object' then return false; end if;
  if length(c::text) > 1024 then return false; end if;
  for k, v in select key, value from jsonb_each(c) loop
    if k = 'visible' then
      if jsonb_typeof(v) <> 'boolean' then return false; end if;
    elsif p_type = 'sticker' then
      if k = 'pin' then
        if jsonb_typeof(v) <> 'object' then return false; end if;
        if exists (select 1 from jsonb_object_keys(v) kk where kk not in ('card','v')) then return false; end if;
        if not (v ? 'card' and v ? 'v') then return false; end if;
        if jsonb_typeof(v->'card') not in ('string','null') then return false; end if;
        if jsonb_typeof(v->'card') = 'string'
           and (v->>'card') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
        if jsonb_typeof(v->'v') <> 'string' or v->>'v' not in ('t','b') then return false; end if;
      elsif k = 'y' then
        if jsonb_typeof(v) <> 'number' then return false; end if;
        n := (v #>> '{}')::numeric;
        if n <> floor(n) or n not between -30000 and 30000 then return false; end if;
      elsif k = 'scale' then
        if jsonb_typeof(v) <> 'number' then return false; end if;
        n := (v #>> '{}')::numeric;
        if n < 0.2 or n > 5 then return false; end if;
      else
        return false;
      end if;
    else
      if k = 'order' then
        if jsonb_typeof(v) <> 'number' then return false; end if;
        n := (v #>> '{}')::numeric;
        if n <> floor(n) or n not between 0 and 79 then return false; end if;
      elsif k = 'w' or k = 'h' then
        if jsonb_typeof(v) <> 'number' then return false; end if;
        n := (v #>> '{}')::numeric;
        if n <> floor(n) or n not between 40 and 2000 then return false; end if;
      else
        return false;
      end if;
    end if;
  end loop;
  return true;
end $$;

alter table public.profile_cards
  add column phone_layout jsonb not null default '{}'::jsonb,
  add constraint profile_cards_phone_layout_check check (public.is_valid_phone_layout(type, phone_layout));

alter table public.profiles
  add column phone_theme jsonb not null default '{}'::jsonb,
  add constraint profiles_phone_theme_check check (public.is_valid_phone_theme(phone_theme));

-- profiles are updated through a column-level grant (0011), so the new column must be
-- added to it. profile_cards has a table-level update grant, so cards_update_own already
-- covers phone_layout.
grant update (phone_theme) on public.profiles to authenticated;

-- validator functions used by the CHECK constraints run as the writer, who needs execute.
grant execute on function public.is_valid_phone_layout(text, jsonb) to authenticated;
grant execute on function public.is_valid_phone_theme(jsonb) to authenticated;

-- ---- rollback (run only to undo; the default values make the forward run a no-op) ----
-- alter table public.profile_cards drop constraint profile_cards_phone_layout_check;
-- alter table public.profile_cards drop column phone_layout;
-- alter table public.profiles      drop constraint profiles_phone_theme_check;
-- alter table public.profiles      drop column phone_theme;
-- revoke update (phone_theme) on public.profiles from authenticated;
-- drop function if exists public.is_valid_phone_layout(text, jsonb);
-- drop function if exists public.is_valid_phone_theme(jsonb);
