-- =====================================================================
-- fiiyou 0032: release hardening.   Run once in the Supabase SQL editor (after 0031).
--
--  1. Rate limits for things that had none: likes (post, photo, comment) and blocks.
--     A like also creates a notification (and a push message) for the other person, so an unlimited like / unlike loop is a way
--     to spam someone. 150 per hour is far above what a person does by hand. The app already shows a friendly message for 'rate_limit'.
--  2. public.spam_exempt() is only used inside the spam trigger (which runs with its owner's rights), so nobody needs to be able to call it
--     through the API. Closing it removes a way to ask "is this user id an official account?".
--
-- Everything else was already locked down (see supabase/audit_rls.sql to check your live database yourself).
-- =====================================================================

-- the rate-limit trigger counts "this person's rows in the last hour": these indexes keep that count cheap
create index if not exists post_likes_user_created_idx    on public.post_likes    (user_id, created_at desc);
create index if not exists photo_likes_user_created_idx   on public.photo_likes   (user_id, created_at desc);
create index if not exists comment_likes_user_created_idx on public.comment_likes (user_id, created_at desc);
create index if not exists blocks_blocker_created_idx     on public.blocks        (blocker_id, created_at desc);

drop trigger if exists post_likes_rate on public.post_likes;
create trigger post_likes_rate    before insert on public.post_likes    for each row execute function public.enforce_rate_limit('150', '1 hour', 'user_id');
drop trigger if exists photo_likes_rate on public.photo_likes;
create trigger photo_likes_rate   before insert on public.photo_likes   for each row execute function public.enforce_rate_limit('150', '1 hour', 'user_id');
drop trigger if exists comment_likes_rate on public.comment_likes;
create trigger comment_likes_rate before insert on public.comment_likes for each row execute function public.enforce_rate_limit('150', '1 hour', 'user_id');
drop trigger if exists blocks_rate on public.blocks;
create trigger blocks_rate        before insert on public.blocks        for each row execute function public.enforce_rate_limit('30', '1 hour', 'blocker_id');

revoke execute on function public.spam_exempt(uuid) from public, anon, authenticated;
