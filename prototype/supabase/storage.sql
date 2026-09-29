insert into storage.buckets (id, name, public)
values ('memory-box-images', 'memory-box-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Authenticated users can upload memory box images" on storage.objects;
create policy "Authenticated users can upload memory box images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'memory-box-images');

drop policy if exists "Authenticated users can update memory box images" on storage.objects;
create policy "Authenticated users can update memory box images"
  on storage.objects for update to authenticated
  using (bucket_id = 'memory-box-images')
  with check (bucket_id = 'memory-box-images');

drop policy if exists "Anyone can view memory box images" on storage.objects;
create policy "Anyone can view memory box images"
  on storage.objects for select to public
  using (bucket_id = 'memory-box-images');
