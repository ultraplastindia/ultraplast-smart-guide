-- 0016: an administrator chooses who sees each link section of the Guide.
-- Safe to run once. Nothing existing changes: every section starts visible to everyone, as before.
--   off    = hidden for everyone
--   admin  = administrators only
--   public = everyone who can open the Guide
create table public.guide_settings (
  key text primary key check (key in ('share_links', 'related_links', 'assist_links')),
  value text not null default 'public' check (value in ('off', 'admin', 'public')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.guide_settings enable row level security;
grant select on public.guide_settings to authenticated;
create policy guide_settings_read on public.guide_settings for select to authenticated
  using (private.has_permission((select auth.uid()), 'browse_catalogue'));

insert into public.guide_settings (key, value) values ('share_links', 'public'), ('related_links', 'public'), ('assist_links', 'public')
on conflict (key) do nothing;

-- Change a setting (needs the manage_catalogue permission). There are no direct writes to the table.
create function public.admin_set_guide_setting(p_key text, p_value text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not private.has_permission(v_actor, 'manage_catalogue') then
    raise exception 'You do not have permission to change Guide settings' using errcode = '42501';
  end if;
  if p_key not in ('share_links', 'related_links', 'assist_links') then raise exception 'Unknown setting' using errcode = '22023'; end if;
  if p_value not in ('off', 'admin', 'public') then raise exception 'Choose off, admin or public' using errcode = '22023'; end if;
  insert into public.guide_settings (key, value, updated_by, updated_at) values (p_key, p_value, v_actor, now())
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  perform private.log_audit(v_actor, 'guide_setting_changed', 'guide_setting', p_key, jsonb_build_object('value', p_value));
end $$;
revoke all on function public.admin_set_guide_setting(text, text) from public, anon;
grant execute on function public.admin_set_guide_setting(text, text) to authenticated;
