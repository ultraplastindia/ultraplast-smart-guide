-- 0002: private helpers (not exposed through the API) and auth triggers.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.is_verified(p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u where u.id = p_uid and u.email_confirmed_at is not null);
$$;

create function private.is_approved(p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_uid and p.access_status = 'approved' and private.is_verified(p.id));
$$;

create function private.stored_role(p_uid uuid) returns public.app_role
language sql stable security definer set search_path = '' as $$
  select r.role from public.user_roles r where r.user_id = p_uid;
$$;

-- Role only counts while the account is approved and verified.
create function private.active_role(p_uid uuid) returns public.app_role
language sql stable security definer set search_path = '' as $$
  select case when private.is_approved(p_uid) then private.stored_role(p_uid) end;
$$;

create function private.has_permission(p_uid uuid, p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.is_approved(p_uid) and (
      private.stored_role(p_uid) = 'super_admin'
      or exists (select 1 from public.role_permissions rp
                 where rp.role = private.stored_role(p_uid) and rp.permission_key = p_key)
      or exists (select 1 from public.user_permissions up
                 where up.user_id = p_uid and up.permission_key = p_key)),
    false);
$$;

create function private.log_audit(p_actor uuid, p_action text, p_type text, p_target text, p_details jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (p_actor, p_action, p_type, p_target, coalesce(p_details, '{}'::jsonb));
$$;

create function private.apply_approval(p_target uuid, p_role public.app_role, p_actor uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set access_status = 'approved', updated_at = now() where id = p_target;
  insert into public.user_roles (user_id, role, assigned_by) values (p_target, p_role, p_actor)
    on conflict (user_id) do update
      set role = excluded.role, assigned_by = excluded.assigned_by, assigned_at = now();
  update public.access_requests
    set status = 'approved', decided_at = now(), decided_by = p_actor, decision_note = p_note
    where user_id = p_target;
  perform private.log_audit(p_actor, 'user_approved', 'user', p_target::text,
    jsonb_build_object('role', p_role, 'note', p_note));
end $$;

-- Runs once an email is verified: creates the access request, and approves
-- only if an administrator already put this exact email on the allowlist.
create function private.process_verified(p_uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  a public.email_allowlist;
begin
  select * into p from public.profiles where id = p_uid;
  if p.id is null or p.access_status not in ('pending_verification','invited') then return; end if;

  update public.profiles set access_status = 'pending_approval', updated_at = now() where id = p_uid;
  insert into public.access_requests (user_id, email, full_name, company)
    values (p.id, p.email, p.full_name, p.company) on conflict (user_id) do nothing;

  select * into a from public.email_allowlist where email = p.email and claimed_by is null;
  if a.email is not null then
    perform private.apply_approval(p_uid, a.role, a.added_by, 'Pre-approved via allowlist');
    update public.email_allowlist set claimed_by = p_uid, claimed_at = now() where email = a.email;
  end if;
end $$;

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Metadata is user-controlled: used only for display text, never for access decisions.
  insert into public.profiles (id, email, full_name, company)
  values (new.id, lower(new.email),
          left(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120),
          left(nullif(trim(new.raw_user_meta_data ->> 'company'), ''), 120));
  if new.email_confirmed_at is not null then perform private.process_verified(new.id); end if;
  return new;
end $$;

create function private.handle_user_verified() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.process_verified(new.id);
  return new;
end $$;

create function private.handle_user_updated() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
    set email = lower(new.email), last_sign_in_at = new.last_sign_in_at, updated_at = now()
    where id = new.id;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
create trigger on_auth_user_verified after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.handle_user_verified();
create trigger on_auth_user_updated after update of email, last_sign_in_at on auth.users
  for each row execute function private.handle_user_updated();

create function private.require_manager() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null or not private.has_permission(v, 'manage_users') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return v;
end $$;

create function private.assert_manage(p_actor uuid, p_target uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_actor = p_target then
    raise exception 'You cannot change your own account' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if private.stored_role(p_target) in ('admin','super_admin')
     and private.active_role(p_actor) is distinct from 'super_admin' then
    raise exception 'Only a Super Admin can manage administrators' using errcode = '42501';
  end if;
end $$;

create function private.assert_not_last_super_admin(p_target uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.stored_role(p_target) = 'super_admin' and (
    select count(*) from public.user_roles r join public.profiles p on p.id = r.user_id
    where r.role = 'super_admin' and p.access_status = 'approved') <= 1 then
    raise exception 'The last active Super Admin cannot be removed or suspended' using errcode = '42501';
  end if;
end $$;

-- Lock down private functions; RLS policies only need these two.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_approved(uuid), private.has_permission(uuid, text) to authenticated;
