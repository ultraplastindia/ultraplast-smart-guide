-- 0001: access-control schema. Credentials stay in Supabase Auth (auth.users).
create type public.access_status as enum
  ('invited','pending_verification','pending_approval','approved','rejected','suspended');
create type public.app_role as enum ('super_admin','admin','approved_user');

create table public.permissions (
  key text primary key,
  description text not null
);
create table public.role_permissions (
  role public.app_role not null,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role, permission_key)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email = lower(email)),
  full_name text,
  company text,
  access_status public.access_status not null default 'pending_verification',
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_status_idx on public.profiles (access_status);

create table public.user_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role public.app_role not null,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now()
);

-- Optional extra permissions per user (e.g. CAD downloads, user management for an Admin).
create table public.user_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  email text not null,
  full_name text,
  company text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  decision_note text
);
create index access_requests_status_idx on public.access_requests (status);

-- An unclaimed row = "Invited". Super Admin is never granted through the allowlist.
create table public.email_allowlist (
  email text primary key check (email = lower(email) and position('@' in email) > 1),
  role public.app_role not null default 'approved_user' check (role <> 'super_admin'),
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

insert into public.permissions (key, description) values
  ('browse_catalogue','Browse, search and view products'),
  ('download_documents','Download permitted technical documents'),
  ('download_cad','Download CAD files'),
  ('export_bom','Export BOMs to Excel and PDF'),
  ('manage_users','Approve, reject and suspend users; manage the allowlist'),
  ('manage_catalogue','Add, edit, verify and archive products and categories'),
  ('upload_documents','Upload images and technical documents'),
  ('manage_imports','Run and review catalogue imports'),
  ('view_audit_log','View the audit log'),
  ('manage_settings','Configure platform settings'),
  ('manage_admins','Create and remove administrators');

insert into public.role_permissions (role, permission_key) values
  ('approved_user','browse_catalogue'),('approved_user','download_documents'),('approved_user','export_bom'),
  ('admin','browse_catalogue'),('admin','download_documents'),('admin','export_bom'),
  ('admin','manage_catalogue'),('admin','upload_documents'),('admin','manage_imports');
insert into public.role_permissions (role, permission_key)
  select 'super_admin', key from public.permissions;
