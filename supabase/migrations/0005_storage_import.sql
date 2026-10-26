-- 0005: private storage buckets, import jobs, server-side batch import.
alter table public.technical_documents
  add constraint cad_needs_cad_permission check (doc_type <> 'cad' or required_permission = 'download_cad');

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  filename text not null,
  catalogue_id uuid references public.catalogues(id) on delete set null,
  status text not null default 'running' check (status in ('running','completed','failed')),
  total_rows int not null default 0,
  imported int not null default 0,
  skipped int not null default 0,
  failed int not null default 0,
  error_report jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.import_jobs enable row level security;
revoke all on public.import_jobs from anon, authenticated;
grant select on public.import_jobs to authenticated;
create policy import_jobs_read on public.import_jobs for select to authenticated
  using (private.has_permission((select auth.uid()), 'manage_imports'));

create function private.require_importer() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null or not (private.has_permission(v, 'manage_imports') and private.has_permission(v, 'manage_catalogue')) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return v;
end $$;

create function public.start_import_job(p_filename text, p_catalogue_name text, p_total int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.require_importer(); v_cat uuid; v_job uuid; v_name text := trim(coalesce(p_catalogue_name, ''));
begin
  if length(v_name) not between 1 and 200 or length(coalesce(p_filename, '')) not between 1 and 255 or p_total not between 1 and 20000 then
    raise exception 'Invalid import details' using errcode = '22023';
  end if;
  select id into v_cat from public.catalogues where name = v_name;
  if v_cat is null then insert into public.catalogues (name) values (v_name) returning id into v_cat; end if;
  insert into public.import_jobs (created_by, filename, catalogue_id, total_rows) values (v_actor, p_filename, v_cat, p_total) returning id into v_job;
  perform private.log_audit(v_actor, 'import_started', 'import_job', v_job::text, jsonb_build_object('file', p_filename, 'rows', p_total));
  return v_job;
end $$;

-- Imports are always saved as unverified drafts and never overwrite existing products.
create function public.import_products_batch(p_job uuid, p_rows jsonb, p_create_categories boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.require_importer();
  v_cat uuid;
  r jsonb; k text; v text;
  v_pid uuid; v_cid uuid; v_name text; v_slug text;
  v_imp int := 0; v_skip int := 0; v_fail int := 0;
  v_err jsonb := '[]'::jsonb;
  v_zero constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  perform set_config('app.skip_audit', '1', true); -- bulk rows are covered by the import job audit entries
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Send at most 500 rows per batch' using errcode = '22023';
  end if;
  select catalogue_id into v_cat from public.import_jobs where id = p_job and created_by = v_actor and status = 'running';
  if not found then raise exception 'Import job not found or already finished' using errcode = 'P0002'; end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    begin
      if length(trim(coalesce(r ->> 'product_code', ''))) not between 1 and 120 then raise exception 'Product code is missing or too long'; end if;
      if length(trim(coalesce(r ->> 'name', ''))) not between 1 and 300 then raise exception 'Name is missing or too long'; end if;
      v_cid := null; v_name := nullif(trim(coalesce(r ->> 'category', '')), '');
      if v_name is not null then
        select id into v_cid from public.product_categories where lower(name) = lower(v_name);
        if v_cid is null then
          if not p_create_categories then raise exception 'Unknown category "%"', v_name; end if;
          v_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
          if v_slug = '' then v_slug := 'category'; end if;
          insert into public.product_categories (name, slug, is_active) values (v_name, v_slug || '-' || substr(gen_random_uuid()::text, 1, 6), true) returning id into v_cid;
        end if;
      end if;
      v_pid := null;
      insert into public.products (product_code, code_normalised, name, category_id, brand, description, material, pitch_mm, width_mm,
                                   thickness_mm, colour, application, status, verification_status, catalogue_id, source_page, drawing_ref, created_by)
      values (trim(r ->> 'product_code'), private.normalise_code(r ->> 'product_code'), trim(r ->> 'name'), v_cid,
              left(nullif(r ->> 'brand', ''), 200), left(nullif(r ->> 'description', ''), 4000), left(nullif(r ->> 'material', ''), 200),
              nullif(r ->> 'pitch_mm', '')::numeric, nullif(r ->> 'width_mm', '')::numeric, nullif(r ->> 'thickness_mm', '')::numeric,
              left(nullif(r ->> 'colour', ''), 100), left(nullif(r ->> 'application', ''), 500), 'draft', 'unverified', v_cat,
              nullif(r ->> 'source_page', '')::int, left(nullif(r ->> 'drawing_ref', ''), 200), v_actor)
      on conflict (code_normalised, (coalesce(catalogue_id, '00000000-0000-0000-0000-000000000000'::uuid))) do nothing
      returning id into v_pid;
      if v_pid is null then
        v_skip := v_skip + 1;
        v_err := v_err || jsonb_build_object('line', r -> 'line', 'code', r ->> 'product_code', 'message', 'Duplicate product code in this catalogue; existing record not changed');
      else
        if jsonb_typeof(r -> 'specs') = 'object' then
          for k, v in select key, value from jsonb_each_text(r -> 'specs') loop
            if length(k) between 1 and 100 and length(v) between 1 and 500 then
              insert into public.product_specifications (product_id, spec_key, spec_value, source_page)
              values (v_pid, k, v, nullif(r ->> 'source_page', '')::int) on conflict do nothing;
            end if;
          end loop;
        end if;
        v_imp := v_imp + 1;
      end if;
    exception when others then
      v_fail := v_fail + 1;
      v_err := v_err || jsonb_build_object('line', r -> 'line', 'code', r ->> 'product_code', 'message', sqlerrm);
    end;
  end loop;

  update public.import_jobs set imported = imported + v_imp, skipped = skipped + v_skip, failed = failed + v_fail,
    error_report = case when jsonb_array_length(error_report) < 1000 then error_report || v_err else error_report end
  where id = p_job;
  return jsonb_build_object('imported', v_imp, 'skipped', v_skip, 'failed', v_fail, 'errors', v_err);
end $$;

create function public.finish_import_job(p_job uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.require_importer(); j public.import_jobs;
begin
  update public.import_jobs set status = 'completed', finished_at = now()
    where id = p_job and created_by = v_actor and status = 'running' returning * into j;
  if j.id is null then raise exception 'Import job not found or already finished' using errcode = 'P0002'; end if;
  perform private.log_audit(v_actor, 'import_finished', 'import_job', p_job::text,
    jsonb_build_object('imported', j.imported, 'skipped', j.skipped, 'failed', j.failed));
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_approved(uuid), private.has_permission(uuid, text), private.normalise_code(text) to authenticated;
revoke execute on function public.start_import_job(text, text, int), public.import_products_batch(uuid, jsonb, boolean),
  public.finish_import_job(uuid) from public, anon;
grant execute on function public.start_import_job(text, text, int), public.import_products_batch(uuid, jsonb, boolean),
  public.finish_import_job(uuid) to authenticated;

-- Private buckets. NOTE: Supabase plan limits cap single-file uploads (50 MB on the free plan).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('technical-documents', 'technical-documents', false, 52428800, null),
  ('product-images', 'product-images', false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('catalogues', 'catalogues', false, null, array['application/pdf'])
on conflict (id) do nothing;

-- Read access follows the database rows (and their RLS), so one rule governs both.
create policy docs_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'technical-documents' and exists (select 1 from public.technical_documents d where d.storage_path = name));
create policy images_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and exists (select 1 from public.product_images i where i.storage_path = name));
create policy catalogues_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'catalogues' and private.has_permission((select auth.uid()), 'manage_imports'));

create policy docs_obj_write on storage.objects for insert to authenticated
  with check (bucket_id = 'technical-documents' and private.has_permission((select auth.uid()), 'upload_documents')
              and lower(name) ~ '\.(pdf|dwg|dxf|step|stp|zip|png|jpg|jpeg)$');
create policy docs_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'technical-documents' and private.has_permission((select auth.uid()), 'upload_documents'));
create policy images_obj_write on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and private.has_permission((select auth.uid()), 'upload_documents')
              and lower(name) ~ '\.(png|jpg|jpeg|webp)$');
create policy images_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and private.has_permission((select auth.uid()), 'upload_documents'));
create policy catalogues_obj_write on storage.objects for insert to authenticated
  with check (bucket_id = 'catalogues' and private.has_permission((select auth.uid()), 'manage_imports') and lower(name) ~ '\.pdf$');
create policy catalogues_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'catalogues' and private.has_permission((select auth.uid()), 'manage_imports'));
