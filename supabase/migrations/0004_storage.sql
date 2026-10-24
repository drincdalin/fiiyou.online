-- =====================================================================
-- 0004: Image storage. One private bucket, files live under <user_id>/...
-- The client compresses to webp before upload (src/api/media.js); the bucket
-- limit below is the server-side backstop. Reads need a login (signed URLs).
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 1572864,
        array['image/webp','image/jpeg','image/png','image/gif'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy media_read on storage.objects for select to authenticated
  using (bucket_id = 'media');

-- max 80 files per user (stops a single account eating the free tier)
create policy media_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select count(*) from storage.objects o
          where o.bucket_id = 'media'
            and (storage.foldername(o.name))[1] = (select auth.uid())::text) < 80
  );
create policy media_update_own on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy media_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
