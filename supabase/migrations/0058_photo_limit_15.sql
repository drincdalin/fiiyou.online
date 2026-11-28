-- 0058: a profile can hold at most 15 gallery photos (it was 60). Run after 0011 (which created limit_photos / photos_limit).
--
-- * The trigger only looks at INSERTs, so a profile that already has more than 15 photos is left exactly as it is: nothing is deleted,
--   the photos keep showing, the owner can still delete, caption, reorder and like. They simply cannot add another photo until they are
--   under the limit again (count < 15).
-- * Two uploads that run at the same moment used to both read "14" and both succeed. The insert now takes a per-owner advisory lock
--   (released at the end of the transaction), so the count it checks is the real one.
-- * The client mirrors the number in src/lib/photoLimit.js (MAX_PHOTOS). Change both together.
--
-- To see who is over the limit (read-only):
--   select owner_id, count(*) from public.photos group by owner_id having count(*) > 15 order by 2 desc;
create or replace function public.limit_photos() returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('photos:' || new.owner_id::text, 0));
  if (select count(*) from public.photos where owner_id = new.owner_id) >= 15 then
    raise exception 'photo_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
