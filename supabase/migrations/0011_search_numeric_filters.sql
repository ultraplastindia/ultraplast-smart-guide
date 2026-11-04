-- 0011: search can also filter by exact pitch, width and thickness (used by clickable table cells).
drop function if exists public.search_products(text, uuid, text, text, text, int, int);

create function public.search_products(
  p_q text default null, p_category uuid default null, p_brand text default null,
  p_material text default null, p_sort text default 'name', p_limit int default 24, p_offset int default 0,
  p_pitch numeric default null, p_width numeric default null, p_thickness numeric default null)
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
      and (p_pitch is null or p.pitch_mm = p_pitch)
      and (p_width is null or p.width_mm = p_width)
      and (p_thickness is null or p.thickness_mm = p_thickness)
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

revoke execute on function public.search_products(text, uuid, text, text, text, int, int, numeric, numeric, numeric) from public, anon;
grant execute on function public.search_products(text, uuid, text, text, text, int, int, numeric, numeric, numeric) to authenticated;
