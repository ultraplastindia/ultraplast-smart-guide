-- 0009: public customer links. A signed-in user with the create_share_links permission makes a link
-- for ONE published product or ONE category. Anyone with the link sees only that item's customer-safe
-- details and images. Links can expire and can be revoked. Nothing else becomes public.
insert into public.permissions (key, description) values ('create_share_links', 'Create public links for customers') on conflict do nothing;
insert into public.role_permissions (role, permission_key) values ('admin', 'create_share_links') on conflict do nothing;

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  kind text not null check (kind in ('product','category')),
  product_id uuid references public.products(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  check ((kind = 'product' and product_id is not null and category_id is null)
      or (kind = 'category' and category_id is not null and product_id is null))
);
alter table public.share_links enable row level security;
grant select on public.share_links to authenticated;
create policy share_links_read on public.share_links for select to authenticated
  using (private.has_permission((select auth.uid()), 'create_share_links')
         and (created_by = (select auth.uid()) or private.has_permission((select auth.uid()), 'manage_users')));

-- Customer-safe fields only (no drafts, no internal catalogue references, no verification details).
create function private.shared_product(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'product_code', p.product_code, 'name', p.name, 'brand', p.brand, 'description', p.description,
    'material', p.material, 'pitch_mm', p.pitch_mm, 'width_mm', p.width_mm, 'thickness_mm', p.thickness_mm,
    'colour', p.colour, 'application', p.application, 'verified', p.verification_status = 'verified',
    'categories', coalesce((select jsonb_agg(c.name order by c.name) from public.product_category_links l
                            join public.product_categories c on c.id = l.category_id where l.product_id = p.id and c.is_active), '[]'::jsonb),
    'specs', coalesce((select jsonb_agg(jsonb_build_object('key', s.spec_key, 'value', s.spec_value, 'unit', s.unit) order by s.spec_key)
                       from public.product_specifications s where s.product_id = p.id), '[]'::jsonb),
    'images', coalesce((select jsonb_agg(jsonb_build_object('path', i.storage_path, 'caption', i.caption) order by i.sort_order)
                        from public.product_images i where i.product_id = p.id), '[]'::jsonb))
  from public.products p where p.id = p_id;
$$;

create function public.create_share_link(p_kind text, p_target uuid, p_days int default 30) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_token text;
begin
  if v_uid is null or not private.has_permission(v_uid, 'create_share_links') then
    raise exception 'Not authorised to create customer links' using errcode = '42501';
  end if;
  if p_kind not in ('product','category') or (p_days is not null and p_days not between 1 and 365) then
    raise exception 'Invalid link request' using errcode = '22023';
  end if;
  if p_kind = 'product' and not exists (select 1 from public.products where id = p_target and status = 'active') then
    raise exception 'Only published products can be shared' using errcode = '22023';
  end if;
  if p_kind = 'category' and not exists (select 1 from public.product_categories where id = p_target and is_active) then
    raise exception 'Category is not available' using errcode = '22023';
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.share_links (token, kind, product_id, category_id, created_by, expires_at)
  values (v_token, p_kind, case when p_kind = 'product' then p_target end, case when p_kind = 'category' then p_target end, v_uid,
          case when p_days is null then null else now() + make_interval(days => p_days) end);
  perform private.log_audit(v_uid, 'share_link_created', p_kind, p_target::text, jsonb_build_object('days', p_days));
  return v_token;
end $$;

create function public.revoke_share_link(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not private.has_permission(v_uid, 'create_share_links') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  update public.share_links set revoked_at = now()
    where id = p_id and revoked_at is null and (created_by = v_uid or private.has_permission(v_uid, 'manage_users'));
  if not found then raise exception 'Link not found' using errcode = 'P0002'; end if;
  perform private.log_audit(v_uid, 'share_link_revoked', 'share_link', p_id::text, '{}'::jsonb);
end $$;

-- Public read of one shared item by its token. Returns null when the link is unknown, expired or revoked.
create function public.get_shared(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.share_links; v jsonb;
begin
  if p_token is null or length(p_token) <> 64 then return null; end if;
  select * into s from public.share_links where token = p_token and revoked_at is null and (expires_at is null or expires_at > now());
  if s.id is null then return null; end if;
  if s.kind = 'product' then
    select jsonb_build_object('kind', 'product', 'product', private.shared_product(p.id)) into v
      from public.products p where p.id = s.product_id and p.status = 'active';
  else
    select jsonb_build_object('kind', 'category', 'name', c.name, 'description', c.description,
      'products', coalesce((select jsonb_agg(private.shared_product(x.id) order by x.product_code)
                            from (select p.id, p.product_code from public.products p
                                  join public.product_category_links l on l.product_id = p.id
                                  where l.category_id = s.category_id and p.status = 'active'
                                  order by p.product_code limit 500) x), '[]'::jsonb)) into v
      from public.product_categories c where c.id = s.category_id and c.is_active;
  end if;
  return v;
end $$;

-- Images of shared items may be read (and signed) without logging in, only while a valid link covers them.
create function private.shared_image_allowed(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.product_images i
    join public.products p on p.id = i.product_id and p.status = 'active'
    join public.share_links s on s.revoked_at is null and (s.expires_at is null or s.expires_at > now())
    where i.storage_path = p_name
      and ((s.kind = 'product' and s.product_id = p.id)
        or (s.kind = 'category' and exists (select 1 from public.product_category_links l where l.product_id = p.id and l.category_id = s.category_id))));
$$;

revoke execute on function private.shared_product(uuid) from public, anon, authenticated;
revoke execute on function private.shared_image_allowed(text) from public;
grant execute on function private.shared_image_allowed(text) to anon, authenticated;
grant usage on schema private to anon;

create policy shared_images_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images' and private.shared_image_allowed(name));

revoke execute on function public.create_share_link(text, uuid, int), public.revoke_share_link(uuid), public.get_shared(text) from public, anon;
grant execute on function public.create_share_link(text, uuid, int), public.revoke_share_link(uuid) to authenticated;
grant execute on function public.get_shared(text) to anon, authenticated;
