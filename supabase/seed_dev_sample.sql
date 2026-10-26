-- DEVELOPMENT ONLY. Clearly labelled sample data. Never run in production.
insert into public.product_categories (slug, name, explorer_zone, sort_order, is_active) values
  ('sample-chains', 'SAMPLE Chains', 'chain', 1, true),
  ('sample-sprockets', 'SAMPLE Sprockets', 'sprocket', 2, true);
insert into public.products (product_code, name, category_id, brand, material, pitch_mm, width_mm, status, verification_status)
select 'SAMPLE-' || lpad(g::text, 4, '0'), 'SAMPLE product ' || g,
       (select id from public.product_categories where slug = case when g % 2 = 0 then 'sample-chains' else 'sample-sprockets' end),
       'SAMPLE brand', case when g % 3 = 0 then 'POM' else 'PA' end, 25.4, 10 * g, 'active', 'unverified'
from generate_series(1, 30) g;
