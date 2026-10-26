-- 0007: optional private bucket for catalogue page images (page-0300.jpg etc.).
-- Upload only if you have the right to republish the catalogue pages.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('page-previews', 'page-previews', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy previews_read on storage.objects for select to authenticated
  using (bucket_id = 'page-previews' and private.has_permission((select auth.uid()), 'browse_catalogue'));
create policy previews_write on storage.objects for insert to authenticated
  with check (bucket_id = 'page-previews' and private.has_permission((select auth.uid()), 'manage_imports')
              and name ~ '^page-[0-9]{4}\.jpg$');
create policy previews_delete on storage.objects for delete to authenticated
  using (bucket_id = 'page-previews' and private.has_permission((select auth.uid()), 'manage_imports'));
