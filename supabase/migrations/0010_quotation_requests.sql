-- 0010: quotation requests (the "Request for quotation" cart in the Smart Guide viewer).
insert into public.permissions (key, description) values ('manage_rfq', 'View and handle quotation requests') on conflict do nothing;
insert into public.role_permissions (role, permission_key) values ('admin', 'manage_rfq') on conflict do nothing;

create sequence public.rfq_ref_seq;

create table public.rfq_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  company text check (length(company) <= 200),
  email text not null check (length(email) <= 254),
  phone text check (length(phone) <= 40),
  message text check (length(message) <= 2000),
  status text not null default 'new' check (status in ('new','in_progress','quoted','closed')),
  handled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rfq_requests_user_idx on public.rfq_requests (user_id, created_at desc);
create index rfq_requests_status_idx on public.rfq_requests (status, created_at desc);

create table public.rfq_items (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.rfq_requests(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_code_snapshot text not null,
  name_snapshot text not null,
  quantity int not null check (quantity between 1 and 100000)
);
create index rfq_items_rfq_idx on public.rfq_items (rfq_id);

alter table public.rfq_requests enable row level security;
alter table public.rfq_items enable row level security;
revoke all on public.rfq_requests, public.rfq_items from anon, authenticated;
grant select on public.rfq_requests, public.rfq_items to authenticated;
create policy rfq_read on public.rfq_requests for select to authenticated
  using (user_id = (select auth.uid()) or private.has_permission((select auth.uid()), 'manage_rfq'));
create policy rfq_items_read on public.rfq_items for select to authenticated
  using (exists (select 1 from public.rfq_requests r where r.id = rfq_items.rfq_id));

-- The only way to create a request: validated, products must be published, written to the audit log.
create function public.submit_rfq(p_name text, p_company text, p_email text, p_phone text, p_message text, p_items jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_id uuid; v_ref text; it jsonb; p public.products; v_qty int;
begin
  if v_uid is null or not private.has_permission(v_uid, 'browse_catalogue') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Enter your name' using errcode = '22023'; end if;
  if length(coalesce(p_email, '')) > 254 or coalesce(p_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Add between 1 and 200 products' using errcode = '22023'; end if;
  v_ref := 'RFQ-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.rfq_ref_seq')::text, 4, '0');
  insert into public.rfq_requests (reference, user_id, name, company, email, phone, message)
    values (v_ref, v_uid, trim(p_name), left(nullif(trim(p_company), ''), 200), trim(p_email), left(nullif(trim(p_phone), ''), 40), left(nullif(trim(p_message), ''), 2000))
    returning id into v_id;
  for it in select value from jsonb_array_elements(p_items) loop
    v_qty := (it ->> 'qty')::int;
    if v_qty is null or v_qty not between 1 and 100000 then raise exception 'Quantity must be between 1 and 100000' using errcode = '22023'; end if;
    select * into p from public.products where id = (it ->> 'id')::uuid and status = 'active';
    if p.id is null then raise exception 'A product in your list is no longer available' using errcode = '22023'; end if;
    insert into public.rfq_items (rfq_id, product_id, product_code_snapshot, name_snapshot, quantity) values (v_id, p.id, p.product_code, p.name, v_qty);
  end loop;
  perform private.log_audit(v_uid, 'rfq_submitted', 'rfq', v_id::text, jsonb_build_object('reference', v_ref, 'items', jsonb_array_length(p_items)));
  return v_ref;
end $$;

create function public.set_rfq_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not private.has_permission(v_uid, 'manage_rfq') then raise exception 'Not authorised' using errcode = '42501'; end if;
  if p_status not in ('new','in_progress','quoted','closed') then raise exception 'Invalid status' using errcode = '22023'; end if;
  update public.rfq_requests set status = p_status, handled_by = v_uid, updated_at = now() where id = p_id;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  perform private.log_audit(v_uid, 'rfq_status_changed', 'rfq', p_id::text, jsonb_build_object('status', p_status));
end $$;

revoke execute on function public.submit_rfq(text, text, text, text, text, jsonb), public.set_rfq_status(uuid, text) from public, anon;
grant execute on function public.submit_rfq(text, text, text, text, text, jsonb), public.set_rfq_status(uuid, text) to authenticated;
