-- Smoke test for approval flow and RLS. Run in the SQL Editor of a THROWAWAY project
-- (it inserts into auth.users). Everything is rolled back at the end.
begin;

create schema tmp_test;
grant usage on schema tmp_test to authenticated, anon;
create function tmp_test.act_as(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function tmp_test.expect_fail(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then return; end;
  raise exception 'EXPECTED FAILURE BUT SUCCEEDED: %', p_label;
end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'super@test.local', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@test.local', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'user1@test.local', now()),
  ('00000000-0000-0000-0000-0000000000b2', 'invited@test.local', null),
  ('00000000-0000-0000-0000-0000000000c1', 'user2@test.local', now());

-- Bootstrap a Super Admin and an Admin (as postgres, bypassing RPCs).
update public.profiles set access_status = 'approved' where email in ('super@test.local','admin@test.local');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'super_admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin');

do $$ begin
  assert (select access_status from public.profiles where email = 'user1@test.local') = 'pending_approval', 'verified signup -> pending_approval';
  assert (select access_status from public.profiles where email = 'invited@test.local') = 'pending_verification', 'unverified signup -> pending_verification';
end $$;

-- 1. A normal pending user cannot approve themselves or write profiles.
select tmp_test.act_as('00000000-0000-0000-0000-0000000000b1');
select tmp_test.expect_fail($q$select public.admin_approve_user('00000000-0000-0000-0000-0000000000b1')$q$, 'self-approval');
select tmp_test.expect_fail($q$update public.profiles set access_status = 'approved'$q$, 'direct profile update');
select tmp_test.expect_fail($q$insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000b1','super_admin')$q$, 'direct role insert');
do $$ begin assert (select count(*) from public.profiles) = 1, 'user sees only own profile'; end $$;
reset role;

-- 2. Admin without manage_users cannot approve.
select tmp_test.act_as('00000000-0000-0000-0000-0000000000a2');
select tmp_test.expect_fail($q$select public.admin_approve_user('00000000-0000-0000-0000-0000000000b1')$q$, 'admin without manage_users');
reset role;

-- 3. Super Admin approves; user then holds browse_catalogue but not manage_users.
select tmp_test.act_as('00000000-0000-0000-0000-0000000000a1');
select public.admin_approve_user('00000000-0000-0000-0000-0000000000b1');
select tmp_test.expect_fail($q$select public.admin_approve_user('00000000-0000-0000-0000-0000000000b2')$q$, 'approving unverified email');
reset role;
select tmp_test.act_as('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  assert (public.my_access() ->> 'status') = 'approved', 'user approved';
  assert (public.my_access() -> 'permissions') ? 'browse_catalogue', 'has browse_catalogue';
  assert not ((public.my_access() -> 'permissions') ? 'manage_users'), 'no manage_users';
end $$;
reset role;

-- 4. Suspension removes all permissions.
select tmp_test.act_as('00000000-0000-0000-0000-0000000000a1');
select public.admin_suspend_user('00000000-0000-0000-0000-0000000000b1');
reset role;
select tmp_test.act_as('00000000-0000-0000-0000-0000000000b1');
do $$ begin assert (public.my_access() -> 'permissions') = '[]'::jsonb, 'suspended user has no permissions'; end $$;
reset role;

-- 5. Super Admin guards.
select tmp_test.act_as('00000000-0000-0000-0000-0000000000a1');
select tmp_test.expect_fail($q$select public.admin_suspend_user('00000000-0000-0000-0000-0000000000a1')$q$, 'self-suspend / last super admin');
select tmp_test.expect_fail($q$select public.admin_add_allowlist('x@test.local', 'super_admin')$q$, 'super admin via allowlist');
reset role;

-- 6. Allowlist pre-approves only the exact verified email.
select tmp_test.act_as('00000000-0000-0000-0000-0000000000a1');
select public.admin_add_allowlist('invited@test.local');
reset role;
update auth.users set email_confirmed_at = now() where email = 'invited@test.local';
do $$ begin
  assert (select access_status from public.profiles where email = 'invited@test.local') = 'approved', 'allowlisted verified email approved';
end $$;

-- 7. Audit trail exists.
do $$ begin assert (select count(*) from public.audit_logs) >= 3, 'audit rows written'; end $$;

-- 8. Catalogue visibility and BOM privacy.
select tmp_test.act_as('00000000-0000-0000-0000-0000000000a1');
select public.admin_approve_user('00000000-0000-0000-0000-0000000000c1');
insert into public.product_categories (slug, name) values ('t-cat', 'T category');
insert into public.products (product_code, name, status) values ('T-1', 'Active', 'active'), ('T-2', 'Draft', 'draft');
reset role;
select set_config('t.draft', (select id::text from public.products where product_code = 'T-2'), true);
select tmp_test.act_as('00000000-0000-0000-0000-0000000000c1');
do $$ begin
  assert (select count(*) from public.products) = 1, 'normal user sees only active products';
  assert (public.search_products('T-1') ->> 'total')::int = 1, 'search finds the active product';
  assert (public.search_products('T-2') ->> 'total')::int = 0, 'search hides the draft product';
end $$;
select tmp_test.expect_fail($q$insert into public.products (product_code, name) values ('T-3', 'x')$q$, 'normal user product insert');
insert into public.boms (name) values ('c1 bom');
select public.add_to_bom((select id from public.boms limit 1), (select id from public.products where product_code = 'T-1'), 2);
select tmp_test.expect_fail($q$select public.add_to_bom((select id from public.boms limit 1), current_setting('t.draft')::uuid, 1)$q$, 'draft product into BOM');
do $$ begin assert (public.export_bom_data((select id from public.boms limit 1)) -> 'items') is not null, 'owner can export own BOM'; end $$;
reset role;
select set_config('t.bom', (select id::text from public.boms limit 1), true);
select tmp_test.act_as('00000000-0000-0000-0000-0000000000a2');
do $$ begin assert (select count(*) from public.boms) = 0, 'other users cannot read BOMs'; end $$;
select tmp_test.expect_fail($q$select public.export_bom_data(current_setting('t.bom')::uuid)$q$, 'exporting another user BOM');
reset role;

-- 9. Anonymous callers get nothing.
set local role anon;
select tmp_test.expect_fail($q$select public.my_access()$q$, 'anon my_access');
select tmp_test.expect_fail($q$select count(*) from public.profiles$q$, 'anon reading profiles');
reset role;

rollback;
