-- 0008: a product can belong to several categories. products.category_id stays as the main category.
create table public.product_category_links (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.product_categories(id) on delete cascade,
  primary key (product_id, category_id)
);
create index product_category_links_cat_idx on public.product_category_links (category_id);

alter table public.product_category_links enable row level security;
grant select, insert, update, delete on public.product_category_links to authenticated;
create policy pcl_read on public.product_category_links for select to authenticated
  using (private.has_permission((select auth.uid()), 'browse_catalogue')
         and exists (select 1 from public.products p where p.id = product_category_links.product_id));
create policy pcl_write on public.product_category_links for all to authenticated
  using (private.has_permission((select auth.uid()), 'manage_catalogue'))
  with check (private.has_permission((select auth.uid()), 'manage_catalogue'));

-- Existing products keep their category.
insert into public.product_category_links (product_id, category_id)
  select id, category_id from public.products where category_id is not null on conflict do nothing;

-- The main category is always one of the links (also covers imports).
create function private.sync_primary_category() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.category_id is not null then
    insert into public.product_category_links (product_id, category_id) values (new.id, new.category_id) on conflict do nothing;
  end if;
  return null;
end $$;
revoke execute on function private.sync_primary_category() from public, anon, authenticated;
create trigger products_sync_category_trg after insert or update of category_id on public.products
  for each row execute function private.sync_primary_category();

-- Category filter and counts now use all links.
create or replace function public.search_products(
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
      and (p_category is null or exists (select 1 from public.product_category_links l where l.product_id = p.id and l.category_id = p_category))
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

create or replace function public.catalogue_facets() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'brands', coalesce((select jsonb_agg(jsonb_build_object('value', brand, 'count', n) order by brand)
      from (select brand, count(*) n from public.products where status <> 'archived' and brand is not null group by brand) b), '[]'::jsonb),
    'materials', coalesce((select jsonb_agg(jsonb_build_object('value', material, 'count', n) order by material)
      from (select material, count(*) n from public.products where status <> 'archived' and material is not null group by material) m), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('value', category_id, 'name', name, 'count', n) order by name)
      from (select l.category_id, c.name, count(*) n from public.product_category_links l
            join public.products p on p.id = l.product_id join public.product_categories c on c.id = l.category_id
            where p.status <> 'archived' group by l.category_id, c.name) k), '[]'::jsonb));
$$;
