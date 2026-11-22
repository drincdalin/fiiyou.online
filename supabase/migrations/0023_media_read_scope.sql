-- 0023: who may read files in the 'media' bucket.
-- Before: any signed-in user could sign a URL for (or list) ANY file in the bucket, which ignored blocks and friends-only posts.
-- Now a file can be read when ALL of these hold:
--   * the reader is signed in
--   * there is no block in either direction between the reader and the file's owner (the first folder of the path)
--   * the file is not the image of a friends-only post written by someone who is not the reader's friend
-- Your own files, and admins (moderation previews), are always readable. Run once in the SQL editor.
-- audio and fonts buckets are unchanged (they only ever load through a profile you can already see).

create or replace function public.can_read_media(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; folder text := split_part(p_name, '/', 1);
begin
  if me is null then return false; end if;
  if folder !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return false; end if;
  owner := folder::uuid;
  if owner = me or public.is_admin() then return true; end if;
  if exists (select 1 from public.blocks b
              where (b.blocker_id = me and b.blocked_id = owner) or (b.blocker_id = owner and b.blocked_id = me)) then return false; end if;
  if exists (select 1 from public.posts po
              where po.image_path = p_name and po.visibility = 'friends' and po.author_id <> me
                and not public.are_friends(me, po.author_id)) then return false; end if;
  return true;
end $$;
revoke all on function public.can_read_media(text) from public, anon;
grant execute on function public.can_read_media(text) to authenticated;

drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.can_read_media(name));

-- speeds up the friends-only check above
create index if not exists posts_image_path_idx on public.posts (image_path) where image_path is not null;
