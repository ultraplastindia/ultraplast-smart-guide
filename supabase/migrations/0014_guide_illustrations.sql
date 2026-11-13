-- 0014: clickable illustration on a Smart Guide page (like the printed index pages).
-- One picture per category page or product page, with callouts: a label and a page code
-- joined by a line to a spot on the picture. Clicking a callout opens the page it points to.
-- Safe to run once. Nothing existing is changed.
create table public.guide_illustrations (
  id uuid primary key default gen_random_uuid(),
  page_kind text not null check (page_kind in ('category','product')),
  page_id uuid not null,
  image_path text not null check (image_path ~ '^[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$'),
  created_at timestamptz not null default now(),
  unique (page_kind, page_id)
);
create table public.guide_callouts (
  id uuid primary key default gen_random_uuid(),
  illustration_id uuid not null references public.guide_illustrations(id) on delete cascade,
  label text not null default '' check (length(label) <= 80),
  target_kind text not null check (target_kind in ('category','product')),
  target_id uuid not null,
  -- positions are percentages of the picture: pointer spot (px, py) and label centre (lx, ly)
  px numeric not null check (px between 0 and 100),
  py numeric not null check (py between 0 and 100),
  lx numeric not null check (lx between 0 and 100),
  ly numeric not null check (ly between 0 and 100),
  sort_order int not null default 0
);
create index guide_callouts_illustration_idx on public.guide_callouts (illustration_id);

alter table public.guide_illustrations enable row level security;
alter table public.guide_callouts enable row level security;
grant select, insert, update, delete on public.guide_illustrations, public.guide_callouts to authenticated;

create policy gi_read on public.guide_illustrations for select to authenticated
  using (private.has_permission((select auth.uid()), 'browse_catalogue'));
create policy gi_write on public.guide_illustrations for all to authenticated
  using (private.has_permission((select auth.uid()), 'manage_catalogue'))
  with check (private.has_permission((select auth.uid()), 'manage_catalogue'));
create policy gc_read on public.guide_callouts for select to authenticated
  using (private.has_permission((select auth.uid()), 'browse_catalogue'));
create policy gc_write on public.guide_callouts for all to authenticated
  using (private.has_permission((select auth.uid()), 'manage_catalogue'))
  with check (private.has_permission((select auth.uid()), 'manage_catalogue'));

-- Private bucket for the pictures. Reading needs browse_catalogue, writing needs manage_catalogue.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guide-illustrations', 'guide-illustrations', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy gi_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'guide-illustrations' and private.has_permission((select auth.uid()), 'browse_catalogue'));
create policy gi_obj_write on storage.objects for insert to authenticated
  with check (bucket_id = 'guide-illustrations' and private.has_permission((select auth.uid()), 'manage_catalogue')
              and name ~ '^[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$');
create policy gi_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'guide-illustrations' and private.has_permission((select auth.uid()), 'manage_catalogue'));
