-- 0013: Gmail / Google Workspace "App password" as a mail service (in addition to Resend and Brevo).
-- ADDITIVE: two new columns on public.mail_settings (created in 0012), a wider list of allowed mail services,
-- and updated versions of three functions from 0012. Nothing else is touched. Run 0012 first. Safe to run again.
--
-- How Gmail works here: the database cannot speak SMTP, so it hands each email to a small Edge Function named
-- "smtp-mail" (supabase/functions/smtp-mail/index.ts). Admin, Email settings shows a ready-to-paste copy of it
-- with a private relay key filled in. The database sends that key with every call and the function refuses
-- anything without it. Gmail can email any address; it always sends from the Gmail address that owns the app password.

alter table public.mail_settings drop constraint if exists mail_settings_provider_check;
alter table public.mail_settings add constraint mail_settings_provider_check check (provider in ('resend', 'brevo', 'gmail'));
alter table public.mail_settings add column if not exists smtp_user text check (smtp_user is null or length(smtp_user) <= 254);
alter table public.mail_settings add column if not exists relay_key text;
update public.mail_settings set relay_key = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') where relay_key is null;

-- ---------------------------------------------------------------- sending (now with the Gmail route)
create or replace function private.send_mail(p_kind text, p_from_email text, p_to text[], p_subject text, p_html text, p_text text, p_reply_to text, p_ref text)
returns bigint language plpgsql security definer set search_path = '' as $fn$
declare
  s public.mail_settings; v_from text; v_name text; v_url text; v_headers jsonb; v_body jsonb; v_id bigint; v_timeout int := 10000;
begin
  select * into s from public.mail_settings where id;
  if s.api_key is null or length(s.api_key) = 0 then
    raise exception 'Email is not set up yet: paste the mail service key in Admin, Email settings' using errcode = '22023';
  end if;
  if s.provider = 'gmail' then
    -- Gmail always sends from the address that owns the app password
    v_from := nullif(trim(s.smtp_user), '');
    if v_from is null then
      raise exception 'Email is not set up yet: enter the Gmail address in Admin, Email settings' using errcode = '22023';
    end if;
    if coalesce(s.api_url, '') = '' or coalesce(s.relay_key, '') = '' then
      raise exception 'Email is not set up yet: open Admin, Email settings and press Save settings' using errcode = '22023';
    end if;
  else
    v_from := coalesce(nullif(trim(p_from_email), ''), nullif(trim(s.from_email), ''));
    if v_from is null then
      raise exception 'Email is not set up yet: enter the sender email address in Admin, Email settings' using errcode = '22023';
    end if;
  end if;
  if p_to is null or cardinality(p_to) = 0 or exists (select 1 from unnest(p_to) as e where e is null or e = '') then
    raise exception 'No recipient email address' using errcode = '22023';
  end if;
  v_name := private.clean_line(s.from_name);

  if s.provider = 'gmail' then
    v_url := s.api_url || '/functions/v1/smtp-mail';
    v_headers := jsonb_build_object('Content-Type', 'application/json', 'x-relay-key', s.relay_key);
    v_body := jsonb_strip_nulls(jsonb_build_object(
      'smtp_user', v_from, 'smtp_pass', s.api_key, 'from_name', v_name, 'to', to_jsonb(p_to),
      'subject', p_subject, 'html', p_html, 'text', p_text, 'reply_to', p_reply_to));
    v_timeout := 25000;
  elsif s.provider = 'brevo' then
    v_url := 'https://api.brevo.com/v3/smtp/email';
    v_headers := jsonb_build_object('api-key', s.api_key, 'Content-Type', 'application/json', 'accept', 'application/json');
    v_body := jsonb_strip_nulls(jsonb_build_object(
      'sender', jsonb_build_object('name', v_name, 'email', v_from),
      'to', (select jsonb_agg(jsonb_build_object('email', e)) from unnest(p_to) as e),
      'subject', p_subject, 'htmlContent', p_html, 'textContent', p_text,
      'replyTo', case when p_reply_to is null then null else jsonb_build_object('email', p_reply_to) end));
  else
    v_url := 'https://api.resend.com/emails';
    v_headers := jsonb_build_object('Authorization', 'Bearer ' || s.api_key, 'Content-Type', 'application/json');
    v_body := jsonb_strip_nulls(jsonb_build_object(
      'from', v_name || ' <' || v_from || '>', 'to', to_jsonb(p_to), 'subject', p_subject,
      'html', p_html, 'text', p_text, 'reply_to', p_reply_to));
  end if;

  v_id := net.http_post(url := v_url, body := v_body, headers := v_headers, timeout_milliseconds := v_timeout);
  insert into public.mail_log (kind, to_email, subject, reference, request_id)
    values (p_kind, array_to_string(p_to, ', '), left(p_subject, 200), p_ref, v_id);
  delete from public.mail_log where created_at < now() - interval '90 days';
  return v_id;
end $fn$;

-- ---------------------------------------------------------------- admin functions
create or replace function public.admin_get_mail_settings() returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v_uid uuid := auth.uid(); s public.mail_settings;
begin
  if v_uid is null or not private.has_permission(v_uid, 'manage_email_settings') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  select * into s from public.mail_settings where id;
  return jsonb_build_object(
    'provider', coalesce(s.provider, 'resend'),
    'smtp_user', s.smtp_user,
    'from_name', coalesce(s.from_name, 'Ultraplast Chainbelts'),
    'from_email', s.from_email,
    'quote_from_email', s.quote_from_email,
    'quote_to_emails', to_jsonb(coalesce(s.quote_to_emails, '{}'::text[])),
    'app_url', s.app_url,
    'api_url', s.api_url,
    'relay_key', s.relay_key,
    'has_key', coalesce(length(s.api_key) > 0, false),
    'key_hint', case when length(coalesce(s.api_key, '')) > 4 then right(s.api_key, 4) end,
    'updated_at', s.updated_at);
end $fn$;

-- the older 8-argument version is replaced by this 9-argument one
drop function if exists public.admin_save_mail_settings(text, text, text, text, text, text[], text, text);

create or replace function public.admin_save_mail_settings(p_provider text, p_api_key text, p_smtp_user text, p_from_name text, p_from_email text,
  p_quote_from_email text, p_quote_to text[], p_app_url text, p_api_url text)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := auth.uid();
  v_re constant text := '^[^@\s<>",;]+@[^@\s<>",;]+\.[^@\s<>",;]+$';
  v_gmail boolean := (p_provider = 'gmail');
  -- an app password is shown by Google in groups of four letters; the spaces are not part of it
  v_key text := nullif(case when p_provider = 'gmail' then regexp_replace(coalesce(p_api_key, ''), '\s', '', 'g') else trim(coalesce(p_api_key, '')) end, '');
  v_smtp text := lower(nullif(trim(coalesce(p_smtp_user, '')), ''));
  v_name text := trim(coalesce(p_from_name, ''));
  v_from text := lower(trim(coalesce(p_from_email, '')));
  v_qfrom text := lower(nullif(trim(coalesce(p_quote_from_email, '')), ''));
  v_app text := nullif(regexp_replace(trim(coalesce(p_app_url, '')), '/+$', ''), '');
  v_api text := nullif(regexp_replace(trim(coalesce(p_api_url, '')), '/+$', ''), '');
  v_to text[]; v_old text; e text;
begin
  if v_uid is null or not private.has_permission(v_uid, 'manage_email_settings') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if p_provider is null or p_provider not in ('resend', 'brevo', 'gmail') then
    raise exception 'Choose Gmail, Resend or Brevo' using errcode = '22023';
  end if;
  if v_gmail then
    if v_key is not null and length(v_key) not between 8 and 128 then
      raise exception 'That does not look like a Gmail app password. It is 16 letters, shown by Google in groups of four.' using errcode = '22023';
    end if;
    if v_smtp is null or length(v_smtp) > 254 or v_smtp !~ v_re then
      raise exception 'Enter the Gmail address that the app password belongs to' using errcode = '22023';
    end if;
    if v_api is null then
      raise exception 'The Supabase project address is missing: set VITE_SUPABASE_URL for the website and save again' using errcode = '22023';
    end if;
    v_from := v_smtp;
    v_qfrom := null;
  else
    if v_key is not null and (length(v_key) not between 10 and 300 or v_key ~ '\s') then
      raise exception 'That does not look like a mail service key. Paste the key exactly as shown, with no spaces.' using errcode = '22023';
    end if;
    if length(v_from) > 254 or v_from !~ v_re then raise exception 'Enter a valid sender email address' using errcode = '22023'; end if;
    if v_qfrom is not null and (length(v_qfrom) > 254 or v_qfrom !~ v_re) then raise exception 'The quotation sender address is not valid' using errcode = '22023'; end if;
  end if;
  if length(v_name) not between 1 and 80 then raise exception 'Enter the sender name (up to 80 characters)' using errcode = '22023'; end if;
  if v_app is not null and v_app !~ '^https?://[^\s]+$' then raise exception 'The website address is not valid' using errcode = '22023'; end if;
  if v_api is not null and v_api !~ '^https?://[^\s]+$' then raise exception 'The project address is not valid' using errcode = '22023'; end if;

  select coalesce(array_agg(distinct x), '{}'::text[]) into v_to
    from (select lower(trim(u)) as x from unnest(coalesce(p_quote_to, '{}'::text[])) as u where trim(u) <> '') t;
  if cardinality(v_to) > 10 then raise exception 'Add at most 10 quotation email addresses' using errcode = '22023'; end if;
  foreach e in array v_to loop
    if length(e) > 254 or e !~ v_re then raise exception 'Not a valid email address: %', e using errcode = '22023'; end if;
  end loop;

  select provider into v_old from public.mail_settings where id;
  if v_old is not null and v_old <> p_provider and v_key is null then
    raise exception 'Paste the new key when you change the mail service' using errcode = '22023';
  end if;
  if v_old is null and v_key is null then
    raise exception 'Paste the mail service key' using errcode = '22023';
  end if;

  insert into public.mail_settings (id, provider, api_key, smtp_user, relay_key, from_name, from_email, quote_from_email, quote_to_emails, app_url, api_url, updated_by, updated_at)
    values (true, p_provider, v_key, v_smtp, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), v_name, v_from, v_qfrom, v_to, v_app, v_api, v_uid, now())
  on conflict (id) do update set
    provider = excluded.provider,
    api_key = coalesce(excluded.api_key, public.mail_settings.api_key),
    smtp_user = excluded.smtp_user,
    relay_key = coalesce(public.mail_settings.relay_key, excluded.relay_key),
    from_name = excluded.from_name, from_email = excluded.from_email, quote_from_email = excluded.quote_from_email,
    quote_to_emails = excluded.quote_to_emails, app_url = excluded.app_url, api_url = excluded.api_url,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  -- neither the key nor the relay key is ever written to the audit log
  perform private.log_audit(v_uid, 'mail_settings_updated', 'mail_settings', 'main',
    jsonb_build_object('provider', p_provider, 'key_changed', v_key is not null, 'quotation_recipients', cardinality(v_to)));
end $fn$;

-- ---------------------------------------------------------------- permissions
revoke execute on function private.send_mail(text, text, text[], text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_get_mail_settings(),
  public.admin_save_mail_settings(text, text, text, text, text, text, text[], text, text) from public, anon;
grant execute on function public.admin_get_mail_settings(),
  public.admin_save_mail_settings(text, text, text, text, text, text, text[], text, text) to authenticated;

-- ---------------------------------------------------------------- ROLLBACK (only to remove Gmail support)
-- Switch the mail service back to Resend or Brevo in Admin, Email settings first, then run:
--   alter table public.mail_settings drop column if exists smtp_user, drop column if exists relay_key;
--   alter table public.mail_settings drop constraint if exists mail_settings_provider_check;
--   alter table public.mail_settings add constraint mail_settings_provider_check check (provider in ('resend', 'brevo'));
--   then run 0012 again to restore the previous versions of the three functions.
