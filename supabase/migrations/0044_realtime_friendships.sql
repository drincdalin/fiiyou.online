-- =====================================================================
-- 0044: put `friendships` on the realtime publication
-- =====================================================================
-- `src/api/friends.js` subscribes to INSERTs on public.friendships filtered
-- by addressee_id, so a friend request appears without a page reload. The
-- table was never added to supabase_realtime, so that subscription has never
-- fired. Every other subscribed table is already published:
--   notifications (0020), messages (0011), message_likes (0034).
-- Safe to re-run.

do $$ begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null; when undefined_object then null; end $$;
