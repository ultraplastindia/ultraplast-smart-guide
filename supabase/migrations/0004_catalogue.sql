-- 0004: catalogue tables, RLS, search and facets.
create extension if not exists pg_trgm with schema extensions;

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.product_categories(id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  description text,
  explorer_zone text check (explorer_zone in ('chain','modular_belt','sprocket','guide_rail','wearstrip','accessories')),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalogues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  edition text,
  source_filename text,
  storage_path text,
  page_count int,
  created_at timestamptz not null default now()
);
create table public.catalogue_pages (
  id uuid primary key default gen_random_uuid(),
  catalogue_id uuid not null references public.catalogues(id) on delete cascade,
  page_number int not null check (page_number > 0),
  extracted_text text,
  ocr_confidence numeric,
  unique (catalogue_id, page_number)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null check (length(trim(product_code)) > 0),
  code_normalised text not null,
  name text not null,
  category_id uuid references public.product_categories(id) on delete set null,
  brand text,
  description text,
  material text,
  pitch_mm numeric,
  width_mm numeric,
  thickness_mm numeric,
  colour text,
  application text,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','needs_review','verified')),
  catalogue_id uuid references public.catalogues(id) on delete set null,
  source_page int,
  drawing_ref text,
  search_tsv tsvector,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_code_catalogue_uq
  on public.products (code_normalised, coalesce(catalogue_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index products_category_idx on public.products (category_id);
create index products_brand_idx on public.products (brand);
create index products_material_idx on public.products (material);
create index products_tsv_idx on public.products using gin (search_tsv);
create index products_code_trgm_idx on public.products using gin (code_normalised extensions.gin_trgm_ops);
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);

create table public.product_specifications (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  spec_key text not null,
  spec_value text not null,
  unit text,
  source_page int,
  unique (product_id, spec_key)
);
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null,
  caption text,
  sort_order int not null default 0,
  is_primary boolean not null default false
);
create table public.product_relations (
  product_id uuid not null references public.products(id) on delete cascade,
  related_product_id uuid not null references public.products(id) on delete cascade,
  primary key (product_id, related_product_id),
  check (product_id <> related_product_id)
);
create table public.technical_documents (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete cascade,
  title text not null,
  doc_type text not null check (doc_type in ('cad','datasheet','drawing','other')),
  storage_path text not null,
  required_permission text not null default 'download_documents'
    check (required_permission in ('download_documents','download_cad')),
  created_at timestamptz not null default now()
);

-- Code normalisation: keep the original code, search on the normalised form.
create function private.normalise_code(p text) returns text
language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create function private.products_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.product_code := trim(new.product_code);
  new.code_normalised := private.normalise_code(new.product_code);
  new.updated_at := now();
  return new;
end $$;

create function private.refresh_product_search(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.products p set search_tsv =
    setweight(to_tsvector('simple', coalesce(p.product_code, '') || ' ' || p.code_normalised), 'A')
    || setweight(to_tsvector('simple', p.name), 'B')
    || setweight(to_tsvector('simple', concat_ws(' ', p.description, p.material, p.brand, p.application, p.colour,
         (select string_agg(s.spec_key || ' ' || s.spec_value, ' ') from public.product_specifications s where s.product_id = p.id))), 'C')
  where p.id = p_id;
$$;

create function private.products_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform private.refresh_product_search(new.id); return new; end $$;

create function private.specs_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.refresh_product_search(case when tg_op = 'DELETE' then old.product_id else new.product_id end);
  return null;
end $$;

create function private.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if current_setting('app.skip_audit', true) = '1' then return null; end if;
  perform private.log_audit(auth.uid(), tg_table_name || '_' || lower(tg_op), tg_table_name, r ->> 'id',
    jsonb_build_object('label', coalesce(r ->> 'product_code', r ->> 'name')));
  return null;
end $$;

create trigger products_before_trg before insert or update on public.products
  for each row execute function private.products_before();
create trigger products_after_trg after insert or update of product_code, name, description, material, brand, application, colour
  on public.products for each row execute function private.products_after();
create trigger specs_after_trg after insert or update or delete on public.product_specifications
  for each row execute function private.specs_after();
create trigger products_audit_ins_trg after insert on public.products for each row execute function private.audit_change();
create trigger products_audit_del_trg after delete on public.products for each row execute function private.audit_change();
-- Skip the internal search-index refresh (it only changes search_tsv).
create trigger products_audit_upd_trg after update on public.products for each row
  when (old.search_tsv is not distinct from new.search_tsv) execute function private.audit_change();
create trigger categories_audit_trg after insert or update or delete on public.product_categories
  for each row execute function private.audit_change();

-- RLS: reading needs browse_catalogue; writing needs manage_catalogue (documents: upload_documents).
do $$
declare t text;
begin
  foreach t in array array['product_categories','catalogues','catalogue_pages','products','product_specifications',
                           'product_images','product_relations','technical_documents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

create policy cat_read on public.product_categories for select to authenticated
  using (private.has_permission((select auth.uid()), 'browse_catalogue')
         and (is_active or private.has_permission((select auth.uid()), 'manage_catalogue')));
create policy cat_write on public.product_categories for all to authenticated
  using (private.has_permission((select auth.uid()), 'manage_catalogue'))
  with check (private.has_permission((select auth.uid()), 'manage_catalogue'));

create policy prod_read on public.products for select to authenticated
  using (private.has_permission((select auth.uid()), 'browse_catalogue')
         and (status = 'active' or private.has_permission((select auth.uid()), 'manage_catalogue')));
create policy prod_write on public.products for all to authenticated
  using (private.has_permission((select auth.uid()), 'manage_catalogue'))
  with check (private.has_permission((select auth.uid()), 'manage_catalogue'));

-- Child tables inherit visibility from products (RLS on products applies inside the subquery).
do $$
declare t text;
begin
  foreach t in array array['product_specifications','product_images','product_relations'] loop
    execute format($f$create policy %1$s_read on public.%1$I for select to authenticated
      using (private.has_permission((select auth.uid()), 'browse_catalogue')
             and exists (select 1 from public.products p where p.id = %1$I.product_id))$f$, t);
    execute format($f$create policy %1$s_write on public.%1$I for all to authenticated
      using (private.has_permission((select auth.uid()), 'manage_catalogue'))
      with check (private.has_permission((select auth.uid()), 'manage_catalogue'))$f$, t);
  end loop;
end $$;

create policy catalogues_read on public.catalogues for select to authenticated
  using (private.has_permission((select auth.uid()), 'browse_catalogue'));
create policy catalogues_write on public.catalogues for all to authenticated
  using (private.has_permission((select auth.uid()), 'manage_imports'))
  with check (private.has_permission((select auth.uid()), 'manage_imports'));
create policy pages_read on public.catalogue_pages for select to authenticated
  using (private.has_permission((select auth.uid()), 'manage_imports'));
create policy pages_write on public.catalogue_pages for all to authenticated
  using (private.has_permission((select auth.uid()), 'manage_imports'))
  with check (private.has_permission((select auth.uid()), 'manage_imports'));

create policy docs_read on public.technical_documents for select to authenticated
  using (private.has_permission((select auth.uid()), 'browse_catalogue')
         and private.has_permission((select auth.uid()), required_permission));
create policy docs_write on public.technical_documents for all to authenticated
  using (private.has_permission((select auth.uid()), 'upload_documents'))
  with check (private.has_permission((select auth.uid()), 'upload_documents'));

-- Search runs as the caller (security invoker), so RLS decides what each user may see.
create function public.search_products(
  p_q text default null, p_category uuid default null, p_brand text default null,
  p_material text default null, p_sort text default 'name', p_limit int default 24, p_offset int default 0)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_q text := nullif(left(trim(coalesce(p_q, '')), 100), '');
  v_norm text := private.normalise_code(v_q);
  v_like text := '%' || replace(replace(replace(coalesce(v_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_limit int := least(greatest(coalesce(p_limit, 24), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  with f as (
    select p.id, p.product_code, p.code_normalised, p.name, p.category_id, c.name as category_name,
           p.brand, p.material, p.verification_status, p.source_page, p.catalogue_id, p.status
    from public.products p left join public.product_categories c on c.id = p.category_id
    where p.status <> 'archived'
      and (p_category is null or p.category_id = p_category)
      and (p_brand is null or p.brand = p_brand)
      and (p_material is null or p.material = p_material)
      and (v_q is null
           or (v_norm <> '' and p.code_normalised like '%' || v_norm || '%')
           or p.name ilike v_like
           or p.search_tsv @@ plainto_tsquery('simple', v_q))
  ), page as (
    select f.*, row_number() over (order by
      case p_sort when 'code' then f.code_normalised when 'category' then f.category_name else f.name end, f.id) as rn
    from f order by rn limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'items', coalesce((select jsonb_agg(to_jsonb(page) - 'rn' - 'code_normalised' order by rn) from page), '[]'::jsonb))
  into v_result;
  return v_result;
end $$;

-- Facets only list values that exist in the data, so the UI never shows empty filters.
create function public.catalogue_facets() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'brands', coalesce((select jsonb_agg(jsonb_build_object('value', brand, 'count', n) order by brand)
      from (select brand, count(*) n from public.products where status <> 'archived' and brand is not null group by brand) b), '[]'::jsonb),
    'materials', coalesce((select jsonb_agg(jsonb_build_object('value', material, 'count', n) order by material)
      from (select material, count(*) n from public.products where status <> 'archived' and material is not null group by material) m), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('value', category_id, 'name', name, 'count', n) order by name)
      from (select p.category_id, c.name, count(*) n from public.products p join public.product_categories c on c.id = p.category_id
            where p.status <> 'archived' group by p.category_id, c.name) k), '[]'::jsonb));
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_approved(uuid), private.has_permission(uuid, text), private.normalise_code(text) to authenticated;
revoke execute on function public.search_products(text, uuid, text, text, text, int, int), public.catalogue_facets() from public, anon;
grant execute on function public.search_products(text, uuid, text, text, text, int, int), public.catalogue_facets() to authenticated;
