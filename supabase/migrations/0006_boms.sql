-- 0006: saved Bills of Materials. Each BOM is private to its owner.
create sequence public.bom_ref_seq;

create table public.boms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reference text not null unique,
  name text not null check (length(trim(name)) between 1 and 200),
  project text check (length(project) <= 200),
  notes text check (length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index boms_owner_idx on public.boms (owner_id, updated_at desc);

create table public.bom_items (
  id uuid primary key default gen_random_uuid(),
  bom_id uuid not null references public.boms(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_code_snapshot text not null,
  name_snapshot text not null,
  quantity int not null default 1 check (quantity between 1 and 100000),
  notes text check (length(notes) <= 1000),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (bom_id, product_id)
);
create index bom_items_bom_idx on public.bom_items (bom_id);

-- Triggers run as the caller, so a user can only add products they are allowed to see.
create function private.boms_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.reference := 'BOM-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.bom_ref_seq')::text, 4, '0');
  else
    new.reference := old.reference; new.owner_id := old.owner_id;
  end if;
  new.updated_at := now();
  return new;
end $$;

create function private.bom_items_before() returns trigger
language plpgsql set search_path = '' as $$
declare p public.products;
begin
  if tg_op = 'INSERT' then
    select * into p from public.products where id = new.product_id;
    if p.id is null then raise exception 'Product not available' using errcode = '42501'; end if;
    new.product_code_snapshot := p.product_code; new.name_snapshot := p.name;
    if (select count(*) from public.bom_items where bom_id = new.bom_id) >= 500
       and not exists (select 1 from public.bom_items where bom_id = new.bom_id and product_id = new.product_id) then
      raise exception 'A BOM can hold at most 500 lines' using errcode = '54000';
    end if;
  else
    new.bom_id := old.bom_id; new.product_id := old.product_id;
    new.product_code_snapshot := old.product_code_snapshot; new.name_snapshot := old.name_snapshot;
  end if;
  return new;
end $$;

create function private.bom_items_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.boms set updated_at = now() where id = coalesce(new.bom_id, old.bom_id);
  return null;
end $$;

create trigger boms_before_trg before insert or update on public.boms for each row execute function private.boms_before();
create trigger bom_items_before_trg before insert or update on public.bom_items for each row execute function private.bom_items_before();
create trigger bom_items_after_trg after insert or update or delete on public.bom_items for each row execute function private.bom_items_after();

alter table public.boms enable row level security;
alter table public.bom_items enable row level security;
grant select, insert, update, delete on public.boms, public.bom_items to authenticated;

create policy boms_owner on public.boms for all to authenticated
  using (owner_id = (select auth.uid()) and private.has_permission((select auth.uid()), 'browse_catalogue'))
  with check (owner_id = (select auth.uid()) and private.has_permission((select auth.uid()), 'browse_catalogue'));
create policy bom_items_owner on public.bom_items for all to authenticated
  using (private.has_permission((select auth.uid()), 'browse_catalogue')
         and exists (select 1 from public.boms b where b.id = bom_id and b.owner_id = (select auth.uid())))
  with check (private.has_permission((select auth.uid()), 'browse_catalogue')
         and exists (select 1 from public.boms b where b.id = bom_id and b.owner_id = (select auth.uid())));

-- Adds a product or increases its quantity. Runs as the caller, so RLS applies.
create function public.add_to_bom(p_bom uuid, p_product uuid, p_qty int default 1) returns void
language sql security invoker set search_path = '' as $$
  insert into public.bom_items (bom_id, product_id, quantity, product_code_snapshot, name_snapshot)
  values (p_bom, p_product, greatest(coalesce(p_qty, 1), 1), '', '')
  on conflict (bom_id, product_id) do update
    set quantity = least(public.bom_items.quantity + excluded.quantity, 100000);
$$;

-- Data for Excel/PDF export. Requires export_bom, owner-only, and is written to the audit log.
create function public.export_bom_data(p_bom uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); b public.boms; v_items jsonb;
begin
  if v_uid is null or not private.has_permission(v_uid, 'export_bom') then
    raise exception 'Not authorised to export BOMs' using errcode = '42501';
  end if;
  select * into b from public.boms where id = p_bom and owner_id = v_uid;
  if b.id is null then raise exception 'BOM not found' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(item order by cat nulls last, code), '[]'::jsonb) into v_items from (
    select c.name as cat, i.product_code_snapshot as code, jsonb_build_object(
      'product_id', i.product_id, 'product_code', i.product_code_snapshot, 'name', i.name_snapshot,
      'category', c.name, 'quantity', i.quantity, 'notes', i.notes, 'material', p.material,
      'pitch_mm', p.pitch_mm, 'width_mm', p.width_mm, 'thickness_mm', p.thickness_mm, 'brand', p.brand,
      'source_page', p.source_page, 'verification_status', p.verification_status,
      'specs', coalesce((select jsonb_agg(jsonb_build_object('key', s.spec_key, 'value', s.spec_value, 'unit', s.unit) order by s.spec_key)
                         from public.product_specifications s where s.product_id = i.product_id), '[]'::jsonb)) as item
    from public.bom_items i left join public.products p on p.id = i.product_id
    left join public.product_categories c on c.id = p.category_id where i.bom_id = p_bom) x;
  perform private.log_audit(v_uid, 'bom_exported', 'bom', p_bom::text, jsonb_build_object('reference', b.reference));
  return jsonb_build_object('generated_at', now(), 'items', v_items,
    'bom', jsonb_build_object('id', b.id, 'reference', b.reference, 'name', b.name, 'project', b.project, 'notes', b.notes, 'created_at', b.created_at));
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_approved(uuid), private.has_permission(uuid, text), private.normalise_code(text) to authenticated;
revoke execute on function public.add_to_bom(uuid, uuid, int), public.export_bom_data(uuid) from public, anon;
grant execute on function public.add_to_bom(uuid, uuid, int), public.export_bom_data(uuid) to authenticated;
