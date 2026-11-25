-- 0055: a sticker's phone pin must hang off a card on the same profile.
-- 0054 stores a sticker's phone pin as profile_cards.phone_layout -> 'pin' -> 'card'
-- (the id of the card the sticker hangs from, and 'v' the edge). The shape is checked by
-- is_valid_phone_layout, but nothing ties that card id to the sticker's own profile, so a
-- sticker could pin to a card on someone else's profile (or a card that does not exist).
-- This BEFORE trigger closes the hole: if the pin names a card id, that card must exist and
-- belong to the same profile, or the write is rejected. Existing rows are untouched.
-- See docs/PHONE_PROFILE.md and tests/99_phone_pin_profile.sql.

create or replace function public.enforce_phone_pin_same_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  c := new.phone_layout -> 'pin' ->> 'card';
  if c is not null then
    if not exists (
      select 1 from public.profile_cards pc
      where pc.id = c::uuid and pc.profile_id = new.profile_id
    ) then
      raise exception 'phone pin must point at a card on the same profile';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profile_cards_phone_pin_same_profile on public.profile_cards;
create trigger profile_cards_phone_pin_same_profile
  before insert or update on public.profile_cards
  for each row execute function public.enforce_phone_pin_same_profile();

-- ---- rollback (run only to undo) ----
-- drop trigger if exists profile_cards_phone_pin_same_profile on public.profile_cards;
-- drop function if exists public.enforce_phone_pin_same_profile();
