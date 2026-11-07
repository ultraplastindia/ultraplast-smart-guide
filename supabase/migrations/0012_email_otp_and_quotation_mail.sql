-- 0012: email service settings, sign-in code emails and quotation notification emails.
-- PURELY ADDITIVE: new tables, new functions, one new permission and one new trigger.
-- No existing table, column, policy or function is changed. Safe to run again.
--
-- What it does
--  1. Admin, Email settings stores the mail service key (Resend or Brevo), the sender address and the
--     address(es) that receive quotation requests. The key can never be read back by the browser.
--  2. public.send_auth_email(event) is the Supabase "Send Email" hook. It sends the sign-in / sign-up
--     verification emails (6-digit code) through the saved mail service.
--  3. A trigger sends a quotation email to the saved recipients whenever a quotation request is saved.
--     It cannot block or undo the request: any email problem is only written to the mail log.

create extension if not exists pg_net;

insert into public.permissions (key, description) values
  ('manage_email_settings', 'Manage the mail service key, sender address and quotation mail recipients')
  on conflict do nothing;

-- ---------------------------------------------------------------- tables (locked: no direct access)
create table if not exists public.mail_settings (
  id boolean primary key default true check (id),
  provider text not null default 'resend' check (provider in ('resend', 'brevo')),
  api_key text,
  from_name text not null default 'Ultraplast Chainbelts' check (length(from_name) between 1 and 80),
  from_email text check (from_email is null or length(from_email) <= 254),
  quote_from_email text check (quote_from_email is null or length(quote_from_email) <= 254),
  quote_to_emails text[] not null default '{}',
  app_url text,
  api_url text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.mail_log (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('verification', 'quotation', 'test')),
  to_email text not null,
  subject text,
  reference text,
  request_id bigint,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists mail_log_created_idx on public.mail_log (created_at desc);

alter table public.mail_settings enable row level security;
alter table public.mail_log enable row level security;
revoke all on public.mail_settings, public.mail_log from anon, authenticated;

-- ---------------------------------------------------------------- small helpers
create or replace function private.html_esc(p text) returns text
language sql immutable set search_path = '' as $fn$
  select replace(replace(replace(replace(replace(replace(replace(coalesce(p, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;'), '{', '&#123;'), '}', '&#125;')
$fn$;

create or replace function private.clean_line(p text) returns text
language sql immutable set search_path = '' as $fn$
  select btrim(regexp_replace(translate(coalesce(p, ''), E'\r\n<>"', '     '), '\s+', ' ', 'g'))
$fn$;

create or replace function private.url_enc(p text) returns text
language plpgsql immutable set search_path = '' as $fn$
declare b bytea := convert_to(coalesce(p, ''), 'UTF8'); o text := ''; i int; c int;
begin
  for i in 0 .. length(b) - 1 loop
    c := get_byte(b, i);
    if (c between 48 and 57) or (c between 65 and 90) or (c between 97 and 122) or c in (45, 46, 95, 126) then
      o := o || chr(c);
    else
      o := o || '%' || upper(lpad(to_hex(c), 2, '0'));
    end if;
  end loop;
  return o;
end $fn$;

-- Replaces {{key}} markers in a template. Values are HTML-escaped by the caller, and html_esc also
-- neutralises curly braces, so customer text can never inject a marker of its own.
create or replace function private.fill(p_tpl text, p_keys text[], p_vals text[]) returns text
language plpgsql immutable set search_path = '' as $fn$
declare v text := p_tpl; i int;
begin
  for i in 1 .. coalesce(cardinality(p_keys), 0) loop
    v := replace(v, '{{' || p_keys[i] || '}}', coalesce(p_vals[i], ''));
  end loop;
  return v;
end $fn$;

-- ---------------------------------------------------------------- the two email designs
create or replace function private.mail_snip(p_name text) returns text
language sql immutable set search_path = '' as $fn$
  select case p_name
    when 'logo_img' then $t$<img src="{{src}}" width="180" height="35" alt="{{alt}}" style="display:block;border:0;outline:none;height:auto;max-width:180px;">$t$
    when 'logo_text' then $t$<span style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#003080;">{{alt}}</span>$t$
    when 'button' then $t$<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 0 auto;"><tr><td align="center" bgcolor="#008040" style="background-color:#008040;border-radius:8px;"><a href="{{url}}" style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">{{label}}</a></td></tr></table><p style="margin:10px 0 0 0;text-align:center;font-size:12px;line-height:18px;color:#8896a5;">Or simply enter the code above.</p>$t$
    when 'tile' then $t$<td width="33%" style="padding:0 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:#f3f7fb;border:1px solid #dde6ef;border-radius:8px;padding:12px 14px;font-family:Arial,Helvetica,sans-serif;"><p style="margin:0;font-size:11px;line-height:14px;letter-spacing:1px;text-transform:uppercase;color:#7b8a98;">{{label}}</p><p style="margin:4px 0 0 0;font-size:22px;line-height:28px;font-weight:700;color:#003080;">{{value}}</p></td></tr></table></td>$t$
    when 'kv_row' then $t$<tr><td width="28%" valign="top" style="padding:9px 0;border-bottom:1px solid #edf1f5;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#7b8a98;">{{label}}</td><td valign="top" style="padding:9px 0;border-bottom:1px solid #edf1f5;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:700;color:#17202a;">{{value}}</td></tr>$t$
    when 'item_row' then $t$<tr><td style="background-color:{{bg}};padding:9px 8px;border-top:1px solid #e6edf4;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#7b8a98;">{{n}}</td><td style="background-color:{{bg}};padding:9px 8px;border-top:1px solid #e6edf4;font-family:Consolas,'Courier New',monospace;font-size:13px;font-weight:700;color:#003080;">{{code}}</td><td style="background-color:{{bg}};padding:9px 8px;border-top:1px solid #e6edf4;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#2b3a47;">{{name}}</td><td align="right" style="background-color:{{bg}};padding:9px 8px;border-top:1px solid #e6edf4;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#17202a;">{{qty}}</td></tr>$t$
    when 'message_block' then $t$<tr><td style="padding:22px 28px 4px 28px;font-family:Arial,Helvetica,sans-serif;"><p style="margin:0;padding:0 0 5px 0;border-bottom:2px solid #008040;display:inline-block;font-size:12px;line-height:16px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;color:#003080;">Message from the customer</p><div style="margin-top:12px;background-color:#f8fafb;border-left:4px solid #008040;border-radius:0 6px 6px 0;padding:14px 16px;font-size:14px;line-height:22px;color:#2b3a47;">{{message}}</div></td></tr>$t$
    when 'btn_primary' then $t$<td bgcolor="#008040" style="background-color:#008040;border-radius:8px;"><a href="{{url}}" style="display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">{{label}}</a></td><td width="10">&nbsp;</td>$t$
    when 'btn_secondary' then $t$<td style="border:2px solid #003080;border-radius:8px;"><a href="{{url}}" style="display:inline-block;padding:11px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#003080;text-decoration:none;">{{label}}</a></td>$t$
  end
$fn$;

-- Design 1: sign-in and verification code email (sent to the person signing in).
create or replace function private.mail_tpl_code() returns text
language sql immutable set search_path = '' as $fn$
  select $t$<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{heading}}</title></head>
<body style="margin:0;padding:0;background-color:#eef2f6;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">{{preheader}}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef2f6;">
<tr><td align="center" style="padding:30px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #d9e1e8;border-radius:14px;">
<tr><td style="padding:26px 34px 22px 34px;">{{logo_block}}</td></tr>
<tr><td style="font-size:0;line-height:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="70%" height="5" style="background-color:#003080;font-size:0;line-height:0;">&nbsp;</td><td width="30%" height="5" style="background-color:#008040;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:36px 34px 12px 34px;font-family:Arial,Helvetica,sans-serif;color:#17202a;">
<p style="margin:0 0 8px 0;font-size:12px;line-height:16px;letter-spacing:2px;text-transform:uppercase;font-weight:700;color:#008040;">{{label}}</p>
<h1 style="margin:0 0 14px 0;font-size:27px;line-height:34px;font-weight:700;color:#003080;">{{heading}}</h1>
<p style="margin:0 0 28px 0;font-size:15px;line-height:24px;color:#394a59;">{{intro}}</p>
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td align="center" style="background-color:#f1f6fc;border:2px dashed #8fb0d4;border-radius:12px;padding:20px 28px 20px 40px;font-family:Consolas,'Courier New',monospace;font-size:40px;line-height:44px;font-weight:700;letter-spacing:12px;color:#003080;">{{code}}</td></tr></table>
<p style="margin:14px 0 0 0;text-align:center;font-size:13px;line-height:20px;color:#667788;">{{code_note}}</p>
{{button_block}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 10px 0;"><tr><td style="background-color:#fff8e6;border-left:4px solid #f0b429;border-radius:6px;padding:13px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#6b4e00;"><strong>Keep this code private.</strong> Our team will never ask you for it. If you did not request it, you can safely ignore this email &mdash; no one can sign in without it.</td></tr></table>
</td></tr>
<tr><td style="padding:22px 34px 28px 34px;border-top:1px solid #e3e9ef;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#7b8a98;text-align:center;">
<strong style="color:#4a5b69;">{{company}}</strong><br>Smart Guide &middot; Conveyor chains, belts and sprockets<br>This is an automated message, please do not reply.</td></tr>
</table></td></tr></table></body></html>$t$::text
$fn$;

-- Design 2: quotation request email (received by the sales team).
create or replace function private.mail_tpl_quote() returns text
language sql immutable set search_path = '' as $fn$
  select $t$<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>New quotation request {{reference}}</title></head>
<body style="margin:0;padding:0;background-color:#f3f5f7;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">{{preheader}}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f5f7;">
<tr><td align="center" style="padding:24px 10px;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background-color:#ffffff;border:1px solid #d5dde5;border-radius:10px;">
<tr><td style="padding:18px 28px;border-bottom:1px solid #e3e9ef;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="left">{{logo_block}}</td><td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#7b8a98;">Quotation desk</td></tr></table></td></tr>
<tr><td style="background-color:#003080;padding:26px 28px;font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0 0 6px 0;font-size:12px;line-height:16px;letter-spacing:2px;text-transform:uppercase;font-weight:700;color:#9fc2ff;">New quotation request</p>
<p style="margin:0;font-size:28px;line-height:34px;font-weight:700;color:#ffffff;">{{reference}}</p>
<p style="margin:6px 0 0 0;font-size:13px;line-height:18px;color:#c9d9f2;">Received {{received}}</p></td></tr>
<tr><td style="padding:22px 24px 4px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>{{tiles}}</tr></table></td></tr>
<tr><td style="padding:20px 28px 4px 28px;font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0;padding:0 0 5px 0;border-bottom:2px solid #008040;display:inline-block;font-size:12px;line-height:16px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;color:#003080;">Customer</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;border-collapse:collapse;">{{customer_rows}}</table></td></tr>
<tr><td style="padding:22px 28px 4px 28px;font-family:Arial,Helvetica,sans-serif;">
<p style="margin:0;padding:0 0 5px 0;border-bottom:2px solid #008040;display:inline-block;font-size:12px;line-height:16px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;color:#003080;">Requested products</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;border-collapse:collapse;border:1px solid #dde6ef;">
<tr><td width="34" style="background-color:#eaf0f7;padding:9px 8px;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:#003080;">#</td><td style="background-color:#eaf0f7;padding:9px 8px;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:#003080;">Code</td><td style="background-color:#eaf0f7;padding:9px 8px;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:#003080;">Product</td><td align="right" style="background-color:#eaf0f7;padding:9px 8px;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:700;color:#003080;">Qty</td></tr>
{{items_rows}}</table></td></tr>
{{message_block}}
<tr><td style="padding:24px 28px 26px 28px;">{{buttons_block}}</td></tr>
<tr><td style="padding:18px 28px 24px 28px;border-top:1px solid #e3e9ef;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#7b8a98;"><strong style="color:#4a5b69;">Tip:</strong> reply to this email to write to the customer directly &mdash; their address is set as Reply-To.<br>Automatic notification from the {{company}} Smart Guide.</td></tr>
</table></td></tr></table></body></html>$t$::text
$fn$;

create or replace function private.mail_logo(p_app_url text, p_name text) returns text
language sql immutable set search_path = '' as $fn$
  select case when coalesce(p_app_url, '') = ''
    then private.fill(private.mail_snip('logo_text'), array['alt'], array[private.html_esc(p_name)])
    else private.fill(private.mail_snip('logo_img'), array['src', 'alt'], array[private.html_esc(p_app_url || '/logo.png'), private.html_esc(p_name)])
  end
$fn$;

-- Link behind the "Verify" button. Empty when the project address is not known (the code still works).
create or replace function private.verify_link(p_api text, p_hash text, p_type text, p_redirect text) returns text
language sql immutable set search_path = '' as $fn$
  select case when coalesce(p_api, '') = '' or coalesce(p_hash, '') = '' then null
    else p_api || '/auth/v1/verify?token=' || private.url_enc(p_hash) || '&type=' || private.url_enc(p_type)
         || case when coalesce(p_redirect, '') = '' then '' else '&redirect_to=' || private.url_enc(p_redirect) end
  end
$fn$;

-- ---------------------------------------------------------------- sending
-- Queues one email with the saved mail service. Non-blocking (pg_net); the result appears in the mail log.
create or replace function private.send_mail(p_kind text, p_from_email text, p_to text[], p_subject text, p_html text, p_text text, p_reply_to text, p_ref text)
returns bigint language plpgsql security definer set search_path = '' as $fn$
declare
  s public.mail_settings; v_from text; v_name text; v_url text; v_headers jsonb; v_body jsonb; v_id bigint;
begin
  select * into s from public.mail_settings where id;
  if s.api_key is null or length(s.api_key) = 0 then
    raise exception 'Email is not set up yet: paste the mail service key in Admin, Email settings' using errcode = '22023';
  end if;
  v_from := coalesce(nullif(trim(p_from_email), ''), nullif(trim(s.from_email), ''));
  if v_from is null then
    raise exception 'Email is not set up yet: enter the sender email address in Admin, Email settings' using errcode = '22023';
  end if;
  if p_to is null or cardinality(p_to) = 0 or exists (select 1 from unnest(p_to) as e where e is null or e = '') then
    raise exception 'No recipient email address' using errcode = '22023';
  end if;
  v_name := private.clean_line(s.from_name);

  if s.provider = 'brevo' then
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

  v_id := net.http_post(url := v_url, body := v_body, headers := v_headers, timeout_milliseconds := 10000);
  insert into public.mail_log (kind, to_email, subject, reference, request_id)
    values (p_kind, array_to_string(p_to, ', '), left(p_subject, 200), p_ref, v_id);
  delete from public.mail_log where created_at < now() - interval '90 days';
  return v_id;
end $fn$;

create or replace function private.send_code_mail(p_to text, p_kind text, p_label text, p_heading text, p_intro text, p_code text, p_btn_label text, p_btn_url text, p_subject text)
returns bigint language plpgsql security definer set search_path = '' as $fn$
declare
  s public.mail_settings; v_co text; v_btn text := ''; v_html text; v_text text;
begin
  select * into s from public.mail_settings where id;
  v_co := coalesce(nullif(trim(s.from_name), ''), 'Ultraplast Chainbelts');
  if coalesce(p_btn_url, '') <> '' then
    v_btn := private.fill(private.mail_snip('button'), array['url', 'label'], array[private.html_esc(p_btn_url), private.html_esc(p_btn_label)]);
  end if;
  v_html := private.fill(private.mail_tpl_code(),
    array['logo_block', 'preheader', 'label', 'heading', 'intro', 'code', 'code_note', 'button_block', 'company'],
    array[private.mail_logo(s.app_url, v_co), private.html_esc(left(p_intro, 110)), private.html_esc(p_label), private.html_esc(p_heading),
          private.html_esc(p_intro), private.html_esc(p_code), 'This code works once and expires shortly.', v_btn, private.html_esc(v_co)]);
  v_text := p_heading || E'\n\n' || p_intro || E'\n\nYour code: ' || p_code
    || E'\n\nKeep this code private. If you did not request it, you can safely ignore this email.'
    || case when coalesce(p_btn_url, '') <> '' then E'\n\n' || p_btn_label || ': ' || p_btn_url else '' end
    || E'\n\n' || v_co;
  return private.send_mail(p_kind, null, array[p_to], private.clean_line(p_subject), v_html, v_text, null, null);
end $fn$;

create or replace function private.quote_mail(p_ref text, p_name text, p_company text, p_email text, p_phone text, p_message text,
  p_created timestamptz, p_items jsonb, p_kind text, p_to text[])
returns bigint language plpgsql security definer set search_path = '' as $fn$
declare
  s public.mail_settings; v_co text; v_n bigint; v_qty bigint; v_rows text; v_cust text; v_tiles text; v_msg text := '';
  v_btns text := ''; v_b1 text := ''; v_b2 text := ''; v_when text; v_subject text; v_text text; v_html text;
  v_ok boolean; v_to text[]; v_admin text; v_who text;
begin
  select * into s from public.mail_settings where id;
  v_to := coalesce(p_to, s.quote_to_emails);
  if v_to is null or cardinality(v_to) = 0 then
    raise exception 'No quotation recipient is set: add one in Admin, Email settings' using errcode = '22023';
  end if;
  v_co := coalesce(nullif(trim(s.from_name), ''), 'Ultraplast Chainbelts');
  -- Reply-To is only set when the customer address is clean, so a strange address can never make the mail fail.
  v_ok := coalesce(p_email, '') ~ '^[^@\s<>",;]+@[^@\s<>",;]+\.[^@\s<>",;]+$' and length(p_email) <= 254;
  v_when := to_char(p_created at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') || ' IST';
  v_who := coalesce(nullif(trim(p_company), ''), p_name);

  select count(*), coalesce(sum(coalesce((t.x ->> 'qty')::bigint, 0)), 0)::bigint,
         coalesce(string_agg(private.fill(private.mail_snip('item_row'),
           array['bg', 'n', 'code', 'name', 'qty'],
           array[case when t.n % 2 = 0 then '#f6f9fc' else '#ffffff' end, t.n::text,
                 private.html_esc(t.x ->> 'code'), private.html_esc(t.x ->> 'name'),
                 to_char(coalesce((t.x ->> 'qty')::bigint, 0), 'FM999,999,999')]), '' order by t.n), '')
    into v_n, v_qty, v_rows
    from jsonb_array_elements(p_items) with ordinality as t(x, n);

  v_cust := private.fill(private.mail_snip('kv_row'), array['label', 'value'], array['Name', private.html_esc(p_name)])
    || private.fill(private.mail_snip('kv_row'), array['label', 'value'], array['Company', coalesce(nullif(private.html_esc(p_company), ''), '&mdash;')])
    || private.fill(private.mail_snip('kv_row'), array['label', 'value'], array['Email',
         case when v_ok then '<a href="mailto:' || private.html_esc(lower(trim(p_email))) || '" style="color:#1d5a78;text-decoration:underline;">' || private.html_esc(p_email) || '</a>'
              else private.html_esc(p_email) end])
    || private.fill(private.mail_snip('kv_row'), array['label', 'value'], array['Phone', coalesce(nullif(private.html_esc(p_phone), ''), '&mdash;')]);

  v_tiles := private.fill(private.mail_snip('tile'), array['label', 'value'], array['Products', v_n::text])
    || private.fill(private.mail_snip('tile'), array['label', 'value'], array['Total quantity', to_char(v_qty, 'FM999,999,999,999')])
    || private.fill(private.mail_snip('tile'), array['label', 'value'], array['Status', 'New']);

  if nullif(trim(coalesce(p_message, '')), '') is not null then
    v_msg := private.fill(private.mail_snip('message_block'), array['message'],
      array[replace(replace(private.html_esc(p_message), E'\r', ''), E'\n', '<br>')]);
  end if;

  v_admin := case when coalesce(s.app_url, '') <> '' then s.app_url || '/admin/rfq' end;
  if v_admin is not null then
    v_b1 := private.fill(private.mail_snip('btn_primary'), array['url', 'label'], array[private.html_esc(v_admin), 'Open in admin panel']);
  end if;
  if v_ok then
    v_b2 := private.fill(private.mail_snip('btn_secondary'), array['url', 'label'], array[private.html_esc('mailto:' || lower(trim(p_email))), 'Reply to customer']);
  end if;
  if v_b1 <> '' or v_b2 <> '' then
    if v_b2 = '' then v_b1 := replace(v_b1, '<td width="10">&nbsp;</td>', ''); end if;
    v_btns := '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' || v_b1 || v_b2 || '</tr></table>';
  end if;

  v_subject := private.clean_line(case when p_kind = 'test' then '[Test] ' else '' end || 'New quotation request ' || p_ref || ' - ' || v_who
    || ' (' || v_n || case when v_n = 1 then ' product)' else ' products)' end);
  v_text := 'New quotation request ' || p_ref || E'\nReceived: ' || v_when
    || E'\n\nCustomer: ' || p_name || coalesce(E'\nCompany: ' || nullif(p_company, ''), '') || E'\nEmail: ' || p_email || coalesce(E'\nPhone: ' || nullif(p_phone, ''), '')
    || E'\n\nProducts (' || v_n || E'), total quantity ' || v_qty || E':\n'
    || coalesce((select string_agg('- ' || (x ->> 'code') || '  ' || (x ->> 'name') || '  x ' || (x ->> 'qty'), E'\n') from jsonb_array_elements(p_items) as x), '')
    || coalesce(E'\n\nMessage:\n' || nullif(p_message, ''), '')
    || case when v_admin is not null then E'\n\nOpen in admin panel: ' || v_admin else '' end;
  v_html := private.fill(private.mail_tpl_quote(),
    array['logo_block', 'preheader', 'reference', 'received', 'tiles', 'customer_rows', 'items_rows', 'message_block', 'buttons_block', 'company'],
    array[private.mail_logo(s.app_url, v_co), private.html_esc(v_who || ' - ' || v_n || ' product(s)'), private.html_esc(p_ref), private.html_esc(v_when),
          v_tiles, v_cust, v_rows, v_msg, v_btns, private.html_esc(v_co)]);
  return private.send_mail(p_kind, s.quote_from_email, v_to, v_subject, v_html, v_text, case when v_ok then lower(trim(p_email)) end, p_ref);
end $fn$;

create or replace function private.send_rfq_mail(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
declare r public.rfq_requests; v_items jsonb;
begin
  select * into r from public.rfq_requests where id = p_id;
  if r.id is null then return; end if;
  select coalesce(jsonb_agg(jsonb_build_object('code', i.product_code_snapshot, 'name', i.name_snapshot, 'qty', i.quantity) order by i.product_code_snapshot), '[]'::jsonb)
    into v_items from public.rfq_items i where i.rfq_id = p_id;
  perform private.quote_mail(r.reference, r.name, r.company, r.email, r.phone, r.message, r.created_at, v_items, 'quotation', null);
end $fn$;

-- Runs when the quotation request is committed (so its items already exist). It can never block the request:
-- any problem is only written to the mail log.
create or replace function private.rfq_notify() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  begin
    perform private.send_rfq_mail(new.id);
  exception when others then
    insert into public.mail_log (kind, to_email, reference, error) values ('quotation', '(not sent)', new.reference, left(sqlerrm, 300));
  end;
  return null;
end $fn$;

drop trigger if exists rfq_notify_mail on public.rfq_requests;
create constraint trigger rfq_notify_mail after insert on public.rfq_requests
  deferrable initially deferred for each row execute function private.rfq_notify();

-- ---------------------------------------------------------------- Supabase "Send Email" hook
-- Enable it in Supabase: Authentication, Hooks, Send Email, type Postgres function, public.send_auth_email.
create or replace function public.send_auth_email(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  d jsonb := coalesce(event -> 'email_data', '{}'::jsonb);
  v_type text := d ->> 'email_action_type';
  v_user text := event -> 'user' ->> 'email';
  v_new text := nullif(event -> 'user' ->> 'new_email', '');
  v_token text := coalesce(d ->> 'token', '');
  v_hash text := coalesce(d ->> 'token_hash', '');
  v_token_new text := coalesce(d ->> 'token_new', '');
  v_hash_new text := coalesce(d ->> 'token_hash_new', '');
  v_redirect text := coalesce(d ->> 'redirect_to', '');
  v_api text;
begin
  select api_url into v_api from public.mail_settings where id;
  if v_type = 'signup' then
    perform private.send_code_mail(v_user, 'verification', 'Verify your email', 'Confirm your email address',
      'Thank you for requesting access to the Ultraplast Smart Guide. Enter this code on the sign-up page to verify your email address. An administrator then reviews your request.',
      v_token, 'Verify my email', private.verify_link(v_api, v_hash, v_type, v_redirect), 'Verify your email for the Ultraplast Smart Guide');
  elsif v_type in ('magiclink', 'email') then
    perform private.send_code_mail(v_user, 'verification', 'Secure sign-in', 'Your sign-in code',
      'Use this code to sign in to the Ultraplast Smart Guide. It can be used only once.',
      v_token, null, null, 'Your Ultraplast Smart Guide sign-in code');
  elsif v_type = 'recovery' then
    perform private.send_code_mail(v_user, 'verification', 'Password reset', 'Reset your password',
      'We received a request to reset your password. Enter this code, or use the button, to choose a new one.',
      v_token, 'Reset my password', private.verify_link(v_api, v_hash, v_type, v_redirect), 'Reset your Ultraplast Smart Guide password');
  elsif v_type = 'invite' then
    perform private.send_code_mail(v_user, 'verification', 'Invitation', 'You have been invited',
      'You have been invited to the Ultraplast Smart Guide. Use the button to accept the invitation and set up your account.',
      v_token, 'Accept invitation', private.verify_link(v_api, v_hash, v_type, v_redirect), 'You are invited to the Ultraplast Smart Guide');
  elsif v_type = 'reauthentication' then
    perform private.send_code_mail(v_user, 'verification', 'Confirm it is you', 'Your confirmation code',
      'Enter this code to confirm a sensitive change to your account.',
      v_token, null, null, 'Your Ultraplast Smart Guide confirmation code');
  elsif v_type = 'email_change' then
    if v_token_new <> '' and v_hash <> '' and v_new is not null then
      -- secure email change: one mail to the current address, one to the new address
      perform private.send_code_mail(v_user, 'verification', 'Email change', 'Confirm the change of email address',
        'Enter this code to approve changing your email address.', v_token, 'Approve the change', private.verify_link(v_api, v_hash_new, v_type, v_redirect), 'Approve your email change');
      perform private.send_code_mail(v_new, 'verification', 'Email change', 'Confirm your new email address',
        'Enter this code to confirm this address as your new email address.', v_token_new, 'Confirm new address', private.verify_link(v_api, v_hash, v_type, v_redirect), 'Confirm your new email address');
    else
      perform private.send_code_mail(coalesce(v_new, v_user), 'verification', 'Email change', 'Confirm your new email address',
        'Enter this code to confirm this address as your new email address.', coalesce(nullif(v_token_new, ''), v_token), 'Confirm new address',
        private.verify_link(v_api, v_hash, v_type, v_redirect), 'Confirm your new email address');
    end if;
  end if;
  -- any other type (for example optional security notifications) is intentionally not sent
  return '{}'::jsonb;
end $fn$;

-- ---------------------------------------------------------------- admin functions (permission: manage_email_settings)
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
    'from_name', coalesce(s.from_name, 'Ultraplast Chainbelts'),
    'from_email', s.from_email,
    'quote_from_email', s.quote_from_email,
    'quote_to_emails', to_jsonb(coalesce(s.quote_to_emails, '{}'::text[])),
    'app_url', s.app_url,
    'api_url', s.api_url,
    'has_key', coalesce(length(s.api_key) > 0, false),
    'key_hint', case when length(coalesce(s.api_key, '')) > 4 then right(s.api_key, 4) end,
    'updated_at', s.updated_at);
end $fn$;

create or replace function public.admin_save_mail_settings(p_provider text, p_api_key text, p_from_name text, p_from_email text,
  p_quote_from_email text, p_quote_to text[], p_app_url text, p_api_url text)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := auth.uid();
  v_re constant text := '^[^@\s<>",;]+@[^@\s<>",;]+\.[^@\s<>",;]+$';
  v_key text := nullif(trim(coalesce(p_api_key, '')), '');
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
  if p_provider is null or p_provider not in ('resend', 'brevo') then raise exception 'Choose Resend or Brevo' using errcode = '22023'; end if;
  if v_key is not null and (length(v_key) not between 10 and 300 or v_key ~ '\s') then
    raise exception 'That does not look like a mail service key. Paste the key exactly as shown, with no spaces.' using errcode = '22023';
  end if;
  if length(v_name) not between 1 and 80 then raise exception 'Enter the sender name (up to 80 characters)' using errcode = '22023'; end if;
  if length(v_from) > 254 or v_from !~ v_re then raise exception 'Enter a valid sender email address' using errcode = '22023'; end if;
  if v_qfrom is not null and (length(v_qfrom) > 254 or v_qfrom !~ v_re) then raise exception 'The quotation sender address is not valid' using errcode = '22023'; end if;
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

  insert into public.mail_settings (id, provider, api_key, from_name, from_email, quote_from_email, quote_to_emails, app_url, api_url, updated_by, updated_at)
    values (true, p_provider, v_key, v_name, v_from, v_qfrom, v_to, v_app, v_api, v_uid, now())
  on conflict (id) do update set
    provider = excluded.provider,
    api_key = coalesce(excluded.api_key, public.mail_settings.api_key),
    from_name = excluded.from_name, from_email = excluded.from_email, quote_from_email = excluded.quote_from_email,
    quote_to_emails = excluded.quote_to_emails, app_url = excluded.app_url, api_url = excluded.api_url,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  -- the key itself is never written to the audit log
  perform private.log_audit(v_uid, 'mail_settings_updated', 'mail_settings', 'main',
    jsonb_build_object('provider', p_provider, 'key_changed', v_key is not null, 'quotation_recipients', cardinality(v_to)));
end $fn$;

create or replace function public.admin_send_test_mail(p_kind text, p_to text) returns bigint
language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := auth.uid();
  v_to text := lower(trim(coalesce(p_to, '')));
begin
  if v_uid is null or not private.has_permission(v_uid, 'manage_email_settings') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if length(v_to) > 254 or v_to !~ '^[^@\s<>",;]+@[^@\s<>",;]+\.[^@\s<>",;]+$' then
    raise exception 'Enter a valid email address to send the test to' using errcode = '22023';
  end if;
  if (select count(*) from public.mail_log where kind = 'test' and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many test emails in the last hour. Try again later.' using errcode = '22023';
  end if;
  if p_kind = 'verification' then
    return private.send_code_mail(v_to, 'test', 'Sample email', 'Your sign-in code',
      'This is a sample sign-in email so you can see how it looks. Real emails contain the code that protects the account.',
      '482915', 'Sample button', 'https://example.com', '[Test] Your Ultraplast Smart Guide sign-in code');
  elsif p_kind = 'quotation' then
    return private.quote_mail('RFQ-TEST-0001', 'Sample Customer', 'Sample Industries Pvt. Ltd.', 'customer@example.com', '+91 98765 43210',
      E'Hello,\nThis is a sample quotation request so you can see how the email looks.\nThank you.', now(),
      '[{"code":"1001-FT-12","name":"Sample flat top chain","qty":2500},{"code":"WS-UHMW-30","name":"Sample wearstrip","qty":120},{"code":"SPR-Z19-25","name":"Sample split sprocket","qty":6}]'::jsonb,
      'test', array[v_to]);
  end if;
  raise exception 'Unknown test type' using errcode = '22023';
end $fn$;

create or replace function public.admin_mail_log() returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not private.has_permission(v_uid, 'manage_email_settings') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select l.id, l.kind, l.to_email, l.subject, l.reference, l.created_at, l.error,
           r.status_code, r.timed_out, left(coalesce(r.error_msg, ''), 200) as net_error,
           case when r.id is null then null else left(coalesce(r.content, ''), 300) end as response
    from public.mail_log l left join net._http_response r on r.id = l.request_id
    order by l.created_at desc limit 25) x), '[]'::jsonb);
end $fn$;

-- ---------------------------------------------------------------- permissions on the new functions
revoke execute on function
  private.html_esc(text), private.clean_line(text), private.url_enc(text), private.fill(text, text[], text[]), private.mail_snip(text),
  private.mail_tpl_code(), private.mail_tpl_quote(), private.mail_logo(text, text), private.verify_link(text, text, text, text),
  private.send_mail(text, text, text[], text, text, text, text, text),
  private.send_code_mail(text, text, text, text, text, text, text, text, text),
  private.quote_mail(text, text, text, text, text, text, timestamptz, jsonb, text, text[]),
  private.send_rfq_mail(uuid), private.rfq_notify()
  from public, anon, authenticated;

revoke execute on function public.admin_get_mail_settings(), public.admin_save_mail_settings(text, text, text, text, text, text[], text, text),
  public.admin_send_test_mail(text, text), public.admin_mail_log() from public, anon;
grant execute on function public.admin_get_mail_settings(), public.admin_save_mail_settings(text, text, text, text, text, text[], text, text),
  public.admin_send_test_mail(text, text), public.admin_mail_log() to authenticated;

-- The hook is called by Supabase Auth only. Nobody can call it through the data API.
revoke all on function public.send_auth_email(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.send_auth_email(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------- ROLLBACK (only to remove this feature)
-- First remove the Send Email hook in Supabase (Authentication, Hooks), then run:
--   drop trigger if exists rfq_notify_mail on public.rfq_requests;
--   drop function if exists public.send_auth_email(jsonb), public.admin_get_mail_settings(), public.admin_mail_log(),
--     public.admin_save_mail_settings(text, text, text, text, text, text[], text, text), public.admin_send_test_mail(text, text);
--   drop function if exists private.rfq_notify(), private.send_rfq_mail(uuid),
--     private.quote_mail(text, text, text, text, text, text, timestamptz, jsonb, text, text[]),
--     private.send_code_mail(text, text, text, text, text, text, text, text, text),
--     private.send_mail(text, text, text[], text, text, text, text, text), private.verify_link(text, text, text, text),
--     private.mail_logo(text, text), private.mail_tpl_quote(), private.mail_tpl_code(), private.mail_snip(text),
--     private.fill(text, text[], text[]), private.url_enc(text), private.clean_line(text), private.html_esc(text);
--   drop table if exists public.mail_log, public.mail_settings;
--   delete from public.permissions where key = 'manage_email_settings';
