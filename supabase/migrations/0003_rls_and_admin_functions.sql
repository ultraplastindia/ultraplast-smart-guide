-- 0003: RLS, grants and the only write path for access control (security-definer RPCs).
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_permissions enable row level security;
alter table public.access_requests enable row level security;
alter table public.email_allowlist enable row level security;
alter table public.audit_logs enable row level security;

-- Defence in depth: no direct writes for API roles on any table, ever.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
grant select on public.permissions, public.role_permissions, public.profiles, public.user_roles,
  public.user_permissions, public.access_requests, public.email_allowlist, public.audit_logs
  to authenticated;

create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.has_permission((select auth.uid()), 'manage_users'));
create policy user_roles_read on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or private.has_permission((select auth.uid()), 'manage_users'));
create policy user_permissions_read on public.user_permissions for select to authenticated
  using (user_id = (select auth.uid()) or private.has_permission((select auth.uid()), 'manage_users'));
create policy access_requests_read on public.access_requests for select to authenticated
  using (user_id = (select auth.uid()) or private.has_permission((select auth.uid()), 'manage_users'));
create policy allowlist_read on public.email_allowlist for select to authenticated
  using (private.has_permission((select auth.uid()), 'manage_users'));
create policy audit_read on public.audit_logs for select to authenticated
  using (private.has_permission((select auth.uid()), 'view_audit_log'));

-- Current user's own access summary (works for pending users too).
create function public.my_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'status', p.access_status,
    'role', private.active_role(p.id),
    'permissions', coalesce((select jsonb_agg(pr.key) from public.permissions pr
                             where private.has_permission(p.id, pr.key)), '[]'::jsonb))
  from public.profiles p where p.id = auth.uid();
$$;

create function public.admin_approve_user(p_target uuid, p_role public.app_role default 'approved_user', p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.require_manager();
begin
  perform private.assert_manage(v_actor, p_target);
  if p_role in ('admin','super_admin') and private.active_role(v_actor) is distinct from 'super_admin' then
    raise exception 'Only a Super Admin can grant administrator roles' using errcode = '42501';
  end if;
  if not private.is_verified(p_target) then
    raise exception 'Email address is not verified' using errcode = '22023';
  end if;
  if (select access_status from public.profiles where id = p_target) not in ('pending_approval','rejected') then
    raise exception 'User is not awaiting approval' using errcode = '22023';
  end if;
  perform private.apply_approval(p_target, p_role, v_actor, p_note);
end $$;

create function public.admin_reject_user(p_target uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.require_manager();
begin
  perform private.assert_manage(v_actor, p_target);
  if (select access_status from public.profiles where id = p_target) <> 'pending_approval' then
    raise exception 'Only pending requests can be rejected' using errcode = '22023';
  end if;
  update public.profiles set access_status = 'rejected', updated_at = now() where id = p_target;
  update public.access_requests set status = 'rejected', decided_at = now(), decided_by = v_actor,
    decision_note = p_note where user_id = p_target;
  delete from public.user_roles where user_id = p_target;
  perform private.log_audit(v_actor, 'user_rejected', 'user', p_target::text, jsonb_build_object('note', p_note));
end $$;

create function public.admin_suspend_user(p_target uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.require_manager();
begin
  perform private.assert_manage(v_actor, p_target);
  perform private.assert_not_last_super_admin(p_target);
  if (select access_status from public.profiles where id = p_target) <> 'approved' then
    raise exception 'Only approved users can be suspended' using errcode = '22023';
  end if;
  update public.profiles set access_status = 'suspended', updated_at = now() where id = p_target;
  perform private.log_audit(v_actor, 'user_suspended', 'user', p_target::text, jsonb_build_object('note', p_note));
end $$;

create function public.admin_reactivate_user(p_target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.require_manager();
begin
  perform private.assert_manage(v_actor, p_target);
  if (select access_status from public.profiles where id = p_target) <> 'suspended' then
    raise exception 'Only suspended users can be reactivated' using errcode = '22023';
  end if;
  if not private.is_verified(p_target) then
    raise exception 'Email address is not verified' using errcode = '22023';
  end if;
  update public.profiles set access_status = 'approved', updated_at = now() where id = p_target;
  insert into public.user_roles (user_id, role, assigned_by) values (p_target, 'approved_user', v_actor)
    on conflict (user_id) do nothing;
  perform private.log_audit(v_actor, 'user_reactivated', 'user', p_target::text, '{}'::jsonb);
end $$;

create function public.admin_set_role(p_target uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.require_manager();
begin
  perform private.assert_manage(v_actor, p_target);
  if p_role in ('admin','super_admin') and private.active_role(v_actor) is distinct from 'super_admin' then
    raise exception 'Only a Super Admin can grant administrator roles' using errcode = '42501';
  end if;
  if (select access_status from public.profiles where id = p_target) <> 'approved' then
    raise exception 'Role can only be set for approved users' using errcode = '22023';
  end if;
  if p_role <> 'super_admin' then perform private.assert_not_last_super_admin(p_target); end if;
  insert into public.user_roles (user_id, role, assigned_by) values (p_target, p_role, v_actor)
    on conflict (user_id) do update set role = excluded.role, assigned_by = excluded.assigned_by, assigned_at = now();
  perform private.log_audit(v_actor, 'role_changed', 'user', p_target::text, jsonb_build_object('role', p_role));
end $$;

create function public.admin_set_permission(p_target uuid, p_permission text, p_granted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.require_manager();
  v_super boolean := coalesce(private.active_role(v_actor) = 'super_admin', false);
begin
  perform private.assert_manage(v_actor, p_target);
  if not v_super and p_permission not in ('download_documents','download_cad','export_bom') then
    raise exception 'Only a Super Admin can grant this permission' using errcode = '42501';
  end if;
  if p_granted then
    insert into public.user_permissions (user_id, permission_key, granted_by)
      values (p_target, p_permission, v_actor) on conflict do nothing;
  else
    delete from public.user_permissions where user_id = p_target and permission_key = p_permission;
  end if;
  perform private.log_audit(v_actor, 'permission_changed', 'user', p_target::text,
    jsonb_build_object('permission', p_permission, 'granted', p_granted));
end $$;

create function public.admin_add_allowlist(p_email text, p_role public.app_role default 'approved_user')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.require_manager();
  v_email text := lower(trim(p_email));
  v_prof public.profiles;
begin
  if length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email address' using errcode = '22023';
  end if;
  if p_role = 'super_admin' then
    raise exception 'Super Admin cannot be granted through the allowlist' using errcode = '42501';
  end if;
  if p_role = 'admin' and private.active_role(v_actor) is distinct from 'super_admin' then
    raise exception 'Only a Super Admin can invite administrators' using errcode = '42501';
  end if;
  insert into public.email_allowlist (email, role, added_by) values (v_email, p_role, v_actor)
    on conflict (email) do update set role = excluded.role, added_by = excluded.added_by
    where public.email_allowlist.claimed_by is null;
  perform private.log_audit(v_actor, 'allowlist_added', 'email', v_email, jsonb_build_object('role', p_role));

  -- If this person already registered and verified, approve them now.
  select * into v_prof from public.profiles where email = v_email;
  if v_prof.id is not null and v_prof.access_status = 'pending_approval' and private.is_verified(v_prof.id) then
    perform private.apply_approval(v_prof.id, p_role, v_actor, 'Approved via allowlist');
    update public.email_allowlist set claimed_by = v_prof.id, claimed_at = now() where email = v_email;
  end if;
end $$;

create function public.admin_remove_allowlist(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.require_manager(); v_email text := lower(trim(p_email));
begin
  delete from public.email_allowlist where email = v_email and claimed_by is null;
  if not found then
    raise exception 'No unclaimed invitation for that email. To revoke an existing user, suspend the account.' using errcode = 'P0002';
  end if;
  perform private.log_audit(v_actor, 'allowlist_removed', 'email', v_email, '{}'::jsonb);
end $$;

create function public.update_my_profile(p_name text, p_company text) returns void
language sql security definer set search_path = '' as $$
  update public.profiles set full_name = left(nullif(trim(p_name), ''), 120), company = left(nullif(trim(p_company), ''), 120), updated_at = now()
  where id = auth.uid();
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.my_access(), public.admin_approve_user(uuid, public.app_role, text),
  public.admin_reject_user(uuid, text), public.admin_suspend_user(uuid, text),
  public.admin_reactivate_user(uuid), public.admin_set_role(uuid, public.app_role),
  public.admin_set_permission(uuid, text, boolean), public.admin_add_allowlist(text, public.app_role),
  public.admin_remove_allowlist(text), public.update_my_profile(text, text) to authenticated;
