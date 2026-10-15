-- Restrict permissive historical DELETE policies: no archived object may be deleted
-- without a physically available matching SHA-256 V8 image and owner authority.
drop policy if exists "mc_v8_archive_delete_guard" on storage.objects;
create policy "mc_v8_archive_delete_guard" on storage.objects as restrictive
for delete to authenticated using (
 bucket_id <> 'shop-mobile-images' or private.mc_v8_archive_delete_allowed(name)
);
