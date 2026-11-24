-- 0053: a profile photo is mandatory before a person can finish onboarding.
--
-- The client (Onboarding + the App gate) holds a signed-in user with no avatar_path on the photo step, but a gate in JavaScript is
-- not a trust boundary: anyone with a token can still write onboarded_at directly. So the rule also lives in the database:
--
--     a profile may be onboarded (onboarded_at IS NOT NULL) only if it has an avatar (avatar_path IS NOT NULL).
--
-- This is a NOT VALID check constraint on purpose:
--   * It backfills nothing and invents no avatars. The ~12 legacy accounts that onboarded before a photo existed keep their rows
--     exactly as they are. The client gate now exposes them, and they are held on the photo step until they upload one.
--   * Every NEW write (insert or update) is still checked, so onboarding can no longer be "completed" without a photo, and a photo
--     cannot be removed from an onboarded account.
-- NOT VALID also means a legacy account with no avatar cannot update its profile row until it has uploaded a photo; that is the
-- desired behaviour: those accounts are already being held on the photo step.

alter table public.profiles
  add constraint profiles_require_avatar
  check (onboarded_at is null or avatar_path is not null)
  not valid;

-- The constraint must eventually be validated once the operator has given the stragglers a photo. This turns the soft rule above
-- into a hard, fully-validated guarantee and clears the "not valid" marker:
--   validate constraint:  alter table public.profiles validate constraint profiles_require_avatar;
-- First list who still needs a photo (supabase/ops/avatarless_accounts.sql). An account with no avatar and onboarded_at set will
-- make `validate constraint` fail, so either they upload one first, or their onboarded_at is reset to null by hand.

-- ---------------------------------------------------------------------------------------------------------------------------------
-- ROLLBACK (run by hand to reverse this migration)
-- ---------------------------------------------------------------------------------------------------------------------------------
--   1. Drop the constraint (restores the old "skip the photo" behaviour in the database):
--        alter table public.profiles drop constraint if exists profiles_require_avatar;
--   2. Revert the client gate and photo step so a photo is optional again:
--        * src/ui/App.jsx: change the onboarding gate back to  if (me.onboarded_at === null)
--        * src/ui/Onboarding.jsx: restore the step-2 "Skip" label and remove the returning-user photo-only path.
--   (There is no data change to undo: this migration never wrote a row.)
