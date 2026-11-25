-- 0056: close the public-key hole left by 0054/0055.
-- `create function` leaves EXECUTE on PUBLIC by default, so `anon` could call
-- is_valid_phone_layout, is_valid_phone_theme and enforce_phone_pin_same_profile
-- directly. 0054/0055 only granted to authenticated. Revoke from PUBLIC and anon,
-- then re-grant to the roles that write: authenticated (the writer the CHECK
-- constraints run as) and service_role (server-side writes). Idempotent.

revoke all on function public.is_valid_phone_layout(text, jsonb) from public, anon;
revoke all on function public.is_valid_phone_theme(jsonb) from public, anon;
revoke all on function public.enforce_phone_pin_same_profile() from public, anon, authenticated;

grant execute on function public.is_valid_phone_layout(text, jsonb) to authenticated, service_role;
grant execute on function public.is_valid_phone_theme(jsonb) to authenticated, service_role;

-- ---- rollback (run only to undo) ----
-- grant execute on function public.is_valid_phone_layout(text, jsonb) to public;
-- grant execute on function public.is_valid_phone_theme(jsonb) to public;
-- grant execute on function public.enforce_phone_pin_same_profile() to public;
