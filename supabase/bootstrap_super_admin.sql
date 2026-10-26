-- ONE-TIME bootstrap of the first Super Admin. Not a migration; never exposed via the API.
-- 1) The designated person signs up in the app and verifies their email.
-- 2) A project owner pastes this into the Supabase SQL Editor, sets v_email, and runs it once.
-- It refuses to run if any Super Admin already exists.
do $$
declare
  v_email text := lower('REPLACE_WITH_ADMIN_EMAIL');
  v_id uuid;
begin
  if v_email like 'replace_with%' then raise exception 'Set v_email first'; end if;
  if exists (select 1 from public.user_roles where role = 'super_admin') then
    raise exception 'A Super Admin already exists; bootstrap refused';
  end if;
  select u.id into v_id from auth.users u
    where lower(u.email) = v_email and u.email_confirmed_at is not null;
  if v_id is null then raise exception 'No verified user with that email'; end if;
  update public.profiles set access_status = 'approved', updated_at = now() where id = v_id;
  update public.access_requests set status = 'approved', decided_at = now(),
    decision_note = 'Bootstrap' where user_id = v_id;
  insert into public.user_roles (user_id, role) values (v_id, 'super_admin');
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values (null, 'bootstrap_super_admin', 'user', v_id::text, jsonb_build_object('email', v_email));
end $$;
