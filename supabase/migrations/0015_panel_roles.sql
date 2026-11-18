-- 0015: customizable roles that decide which panels (menu sections) a person sees.
-- Safe to run once. Nothing existing changes: a person with no panel role sees every panel, as before.
-- Panels are a menu and screen control. What a person may read or change is still decided by the
-- existing roles and permissions (manage_catalogue, download_cad and so on), which the database enforces.
create table public.panel_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 40),
  description text not null default '' check (length(description) <= 200),
  panels text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint panel_roles_panels_valid check (panels <@ array['home','categories','explorer','guide','catalogue','compare','documents','bom','dashboard','help','admin']::text[])
);
create unique index panel_roles_name_key on public.panel_roles (lower(btrim(name)));

create table public.user_panel_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role_id uuid not null references public.panel_roles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now()
);

alter table public.panel_roles enable row level security;
alter table public.user_panel_roles enable row level security;
grant select on public.panel_roles, public.user_panel_roles to authenticated;
create policy panel_roles_read on public.panel_roles for select to authenticated
  using (private.has_permission((select auth.uid()), 'manage_users'));
create policy user_panel_roles_read on public.user_panel_roles for select to authenticated
  using (user_id = (select auth.uid()) or private.has_permission((select auth.uid()), 'manage_users'));

-- The signed-in person's panels. null means every panel (Super Admins and people with no panel role).
create function public.my_panels() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.active_role(auth.uid()) = 'super_admin' then null
    else (select to_jsonb(r.panels) from public.user_panel_roles u join public.panel_roles r on r.id = u.role_id where u.user_id = auth.uid()) end;
$$;

-- Create or change a role (Super Admin only).
create function public.admin_save_panel_role(p_id uuid, p_name text, p_description text, p_panels text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.require_manager(); v_id uuid := p_id;
begin
  if private.active_role(v_actor) is distinct from 'super_admin' then
    raise exception 'Only a Super Admin can create or change roles' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 then raise exception 'Give the role a name' using errcode = '22023'; end if;
  if exists (select 1 from public.panel_roles where lower(btrim(name)) = lower(btrim(p_name)) and id is distinct from p_id) then
    raise exception 'A role with this name already exists' using errcode = '23505';
  end if;
  if v_id is null then
    insert into public.panel_roles (name, description, panels) values (btrim(p_name), coalesce(p_description, ''), coalesce(p_panels, '{}')) returning id into v_id;
  else
    update public.panel_roles set name = btrim(p_name), description = coalesce(p_description, ''), panels = coalesce(p_panels, '{}') where id = v_id;
    if not found then raise exception 'Role not found' using errcode = 'P0002'; end if;
  end if;
  perform private.log_audit(v_actor, 'panel_role_saved', 'panel_role', v_id::text, jsonb_build_object('name', p_name, 'panels', p_panels));
  return v_id;
end $$;

-- Delete a role. People who had it go back to seeing every panel.
create function public.admin_delete_panel_role(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.require_manager();
begin
  if private.active_role(v_actor) is distinct from 'super_admin' then
    raise exception 'Only a Super Admin can delete roles' using errcode = '42501';
  end if;
  delete from public.panel_roles where id = p_id;
  perform private.log_audit(v_actor, 'panel_role_deleted', 'panel_role', p_id::text, '{}'::jsonb);
end $$;

-- Give a person a role (null removes it). Administrators can only be changed by a Super Admin.
create function public.admin_assign_panel_role(p_target uuid, p_role uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.require_manager();
begin
  perform private.assert_manage(v_actor, p_target);
  if p_role is null then
    delete from public.user_panel_roles where user_id = p_target;
  else
    if not exists (select 1 from public.panel_roles where id = p_role) then raise exception 'Role not found' using errcode = 'P0002'; end if;
    insert into public.user_panel_roles (user_id, role_id, assigned_by) values (p_target, p_role, v_actor)
      on conflict (user_id) do update set role_id = excluded.role_id, assigned_by = excluded.assigned_by, assigned_at = now();
  end if;
  perform private.log_audit(v_actor, 'panel_role_assigned', 'user', p_target::text, jsonb_build_object('role', p_role));
end $$;

revoke all on function public.my_panels(), public.admin_save_panel_role(uuid, text, text, text[]), public.admin_delete_panel_role(uuid), public.admin_assign_panel_role(uuid, uuid) from public, anon;
grant execute on function public.my_panels(), public.admin_save_panel_role(uuid, text, text, text[]), public.admin_delete_panel_role(uuid), public.admin_assign_panel_role(uuid, uuid) to authenticated;

-- Starting roles. Change or delete them under Admin, User access.
insert into public.panel_roles (name, description, panels) values
  ('User', 'Everything except the Admin panel', array['home','categories','explorer','guide','catalogue','compare','documents','bom','dashboard','help']),
  ('Admin', 'Every panel including Admin', array['home','categories','explorer','guide','catalogue','compare','documents','bom','dashboard','help','admin']),
  ('Guide only', 'Only the Guide', array['guide'])
on conflict do nothing;
