-- Pixel Direct Ltd. — camera inventory schema
-- Run this once in the Supabase SQL editor on a fresh project.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- Profiles (one row per auth.users, carries role)
-- ─────────────────────────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null check (role in ('admin', 'tester', 'dispatcher', 'checker')),
  -- Removing staff deactivates + bans them rather than deleting the row, since
  -- units/stock_counts reference profiles and a real inventory needs to keep
  -- "who tested/picked this" intact even after someone leaves.
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user is created. Staff are created
-- by an admin invite (see src/app/admin/actions.ts), which sets full_name and
-- role in the invited user's metadata; falls back to 'tester' if missing.
create function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'role', 'tester')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Helper used inside RLS policies to read the caller's role without recursion.
create function app_role()
returns text
language sql
security definer set search_path = public
stable
as $$
  select role from profiles where id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────
-- Catalog: brand → model → variant (model + color) → grade
-- ─────────────────────────────────────────────────────────────
create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table models (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete restrict,
  name text not null,
  unique (brand_id, name)
);

create table model_variants (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models (id) on delete restrict,
  color text not null,
  unique (model_id, color)
);

create table grades (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,      -- 'A', 'B', 'C', ...
  label text not null,            -- optional longer label, defaults to code
  sort_order int not null default 0
);

insert into grades (code, label, sort_order) values
  ('A', 'Grade A', 1),
  ('B', 'Grade B', 2),
  ('C', 'Grade C', 3);

-- ─────────────────────────────────────────────────────────────
-- SKU lines: one per (variant, grade). This is what the QR encodes.
-- `quantity` is a denormalized in-stock count, kept in sync by a trigger
-- on `units` so dashboards can read it without counting every time.
-- ─────────────────────────────────────────────────────────────
create table sku_lines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,   -- short human/QR code, e.g. PXL-000123
  model_variant_id uuid not null references model_variants (id) on delete restrict,
  grade_id uuid not null references grades (id) on delete restrict,
  quantity int not null default 0,
  created_at timestamptz not null default now(),
  unique (model_variant_id, grade_id)
);

create sequence sku_line_code_seq;

create function next_sku_code()
returns text
language sql
as $$
  select 'PXL-' || lpad(nextval('sku_line_code_seq')::text, 6, '0');
$$;

-- ─────────────────────────────────────────────────────────────
-- Units: one row per physical camera. Many units share one sku_line.
-- ─────────────────────────────────────────────────────────────
create table units (
  id uuid primary key default gen_random_uuid(),
  sku_line_id uuid not null references sku_lines (id) on delete restrict,
  serial_number text not null unique,
  note text,                                   -- e.g. "with adapter", "missing battery"
  status text not null default 'in_stock' check (status in ('in_stock', 'picked', 'shipped')),
  tester_id uuid not null references profiles (id),
  tested_at timestamptz not null default now(),
  picked_by uuid references profiles (id),
  picked_at timestamptz
);

create index units_sku_line_status_idx on units (sku_line_id, status);

-- Keep sku_lines.quantity equal to count of that line's in_stock units.
-- Handles both insert/delete and the edit-unit flow, which can move a unit to
-- a different sku_line (e.g. correcting a wrongly graded camera) — that case
-- must recompute quantity for BOTH the old and new sku_line.
create function sync_sku_line_quantity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    update sku_lines
    set quantity = (select count(*) from units where sku_line_id = old.sku_line_id and status = 'in_stock')
    where id = old.sku_line_id;
    return old;
  end if;

  update sku_lines
  set quantity = (select count(*) from units where sku_line_id = new.sku_line_id and status = 'in_stock')
  where id = new.sku_line_id;

  if tg_op = 'UPDATE' and old.sku_line_id is distinct from new.sku_line_id then
    update sku_lines
    set quantity = (select count(*) from units where sku_line_id = old.sku_line_id and status = 'in_stock')
    where id = old.sku_line_id;
  end if;

  return new;
end;
$$;

create trigger units_sync_quantity
  after insert or update of status, sku_line_id or delete on units
  for each row execute procedure sync_sku_line_quantity();

-- ─────────────────────────────────────────────────────────────
-- Stock counts: a checker's scanning session vs. system quantities
-- ─────────────────────────────────────────────────────────────
create table stock_counts (
  id uuid primary key default gen_random_uuid(),
  checker_id uuid not null references profiles (id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  note text
);

-- One row per physical unit scanned in a session. The unique constraint means
-- re-scanning the same label twice in one session doesn't double-count it.
create table stock_count_scans (
  id uuid primary key default gen_random_uuid(),
  stock_count_id uuid not null references stock_counts (id) on delete cascade,
  unit_id uuid not null references units (id),
  scanned_at timestamptz not null default now(),
  unique (stock_count_id, unit_id)
);

-- Aggregates scan counts in SQL rather than pulling every raw scan row to the
-- client and grouping in JS — that approach re-fetches the whole session's
-- scan history after every single scan, so a session of n scans transfers
-- O(n^2) scan rows in total. This returns one row per SKU line instead,
-- bounded by catalog size rather than scan count. Runs as the caller (not
-- security definer), so it's subject to the same RLS as a plain query — a
-- checker only sees real counts for a session they own (or as admin).
create function get_stock_count_tally(p_stock_count_id uuid)
returns table (
  sku_line_id uuid,
  brand text,
  model text,
  color text,
  grade text,
  system_qty int,
  scanned_qty int
)
language sql
stable
as $$
  select
    sl.id as sku_line_id,
    b.name as brand,
    m.name as model,
    mv.color as color,
    g.code as grade,
    sl.quantity as system_qty,
    coalesce(scan_counts.scanned_qty, 0) as scanned_qty
  from sku_lines sl
  join model_variants mv on mv.id = sl.model_variant_id
  join models m on m.id = mv.model_id
  join brands b on b.id = m.brand_id
  join grades g on g.id = sl.grade_id
  left join (
    select u.sku_line_id, count(*)::int as scanned_qty
    from stock_count_scans scs
    join units u on u.id = scs.unit_id
    where scs.stock_count_id = p_stock_count_id
    group by u.sku_line_id
  ) scan_counts on scan_counts.sku_line_id = sl.id
  where sl.quantity > 0 or coalesce(scan_counts.scanned_qty, 0) > 0
  order by sl.id;
$$;

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────
alter table profiles enable row level security;
alter table brands enable row level security;
alter table models enable row level security;
alter table model_variants enable row level security;
alter table grades enable row level security;
alter table sku_lines enable row level security;
alter table units enable row level security;
alter table stock_counts enable row level security;
alter table stock_count_scans enable row level security;

-- Everyone signed in can read their own profile; admins read/manage all.
create policy profiles_self_read on profiles for select using (id = auth.uid() or app_role() = 'admin');
create policy profiles_admin_write on profiles for all using (app_role() = 'admin') with check (app_role() = 'admin');

-- Catalog tables: all authenticated staff can read; only admin/tester can create new
-- brands/models/variants (testers need this to add a camera model that doesn't exist yet);
-- only admin can edit or delete.
create policy catalog_read_brands on brands for select using (auth.role() = 'authenticated');
create policy catalog_write_brands on brands for insert with check (app_role() in ('admin', 'tester'));
create policy catalog_admin_all_brands on brands for update using (app_role() = 'admin');
create policy catalog_admin_delete_brands on brands for delete using (app_role() = 'admin');

create policy catalog_read_models on models for select using (auth.role() = 'authenticated');
create policy catalog_write_models on models for insert with check (app_role() in ('admin', 'tester'));
create policy catalog_admin_all_models on models for update using (app_role() = 'admin');
create policy catalog_admin_delete_models on models for delete using (app_role() = 'admin');

create policy catalog_read_variants on model_variants for select using (auth.role() = 'authenticated');
create policy catalog_write_variants on model_variants for insert with check (app_role() in ('admin', 'tester'));
create policy catalog_admin_all_variants on model_variants for update using (app_role() = 'admin');
create policy catalog_admin_delete_variants on model_variants for delete using (app_role() = 'admin');

create policy catalog_read_grades on grades for select using (auth.role() = 'authenticated');
create policy catalog_admin_write_grades on grades for all using (app_role() = 'admin') with check (app_role() = 'admin');

-- SKU lines: all staff read; tester (and admin) can create/update (find-or-create + quantity sync).
create policy sku_lines_read on sku_lines for select using (auth.role() = 'authenticated');
create policy sku_lines_write on sku_lines for insert with check (app_role() in ('admin', 'tester'));
create policy sku_lines_update on sku_lines for update using (app_role() in ('admin', 'tester', 'dispatcher'));
create policy sku_lines_admin_delete on sku_lines for delete using (app_role() = 'admin');

-- Units: all staff read (dispatcher/checker need lookups); tester creates; tester/dispatcher/admin update
-- (dispatcher marks picked; tester might correct a note/serial shortly after testing).
create policy units_read on units for select using (auth.role() = 'authenticated');
create policy units_insert on units for insert with check (app_role() in ('admin', 'tester'));
create policy units_update on units for update using (app_role() in ('admin', 'tester', 'dispatcher'));

-- Stock counts: checker creates/owns their sessions; admin sees all.
create policy stock_counts_read on stock_counts for select using (checker_id = auth.uid() or app_role() = 'admin');
create policy stock_counts_write on stock_counts for insert with check (app_role() in ('admin', 'checker'));
create policy stock_counts_update on stock_counts for update using (checker_id = auth.uid() or app_role() = 'admin');

create policy stock_count_scans_read on stock_count_scans for select using (
  exists (select 1 from stock_counts sc where sc.id = stock_count_id and (sc.checker_id = auth.uid() or app_role() = 'admin'))
);
create policy stock_count_scans_write on stock_count_scans for insert with check (
  exists (select 1 from stock_counts sc where sc.id = stock_count_id and sc.checker_id = auth.uid())
);
create policy stock_count_scans_update on stock_count_scans for update using (
  exists (select 1 from stock_counts sc where sc.id = stock_count_id and sc.checker_id = auth.uid())
);

-- ─────────────────────────────────────────────────────────────
-- Catalog merge helpers (admin-only "fix a duplicate" tools). Each runs as
-- the calling user (relies on the admin RLS grants above), wrapped in one
-- transaction since a single function call is atomic. Lower-level merges
-- cascade upward: merging two models also merges any same-color variants
-- between them, which in turn merges any same-grade sku_lines (moving their
-- units) rather than hitting a unique-constraint conflict.
-- ─────────────────────────────────────────────────────────────
create function merge_sku_lines(source_id uuid, target_id uuid)
returns void
language plpgsql
as $$
begin
  if app_role() <> 'admin' then
    raise exception 'Only an admin can merge SKU lines';
  end if;
  update units set sku_line_id = target_id where sku_line_id = source_id;
  delete from sku_lines where id = source_id;
end;
$$;

create function merge_variants(source_id uuid, target_id uuid)
returns void
language plpgsql
as $$
declare
  r record;
begin
  if app_role() <> 'admin' then
    raise exception 'Only an admin can merge colors';
  end if;
  if source_id = target_id then
    raise exception 'Cannot merge a color into itself';
  end if;

  for r in
    select sl.id as source_sku_id, existing.id as target_sku_id
    from sku_lines sl
    join sku_lines existing on existing.model_variant_id = target_id and existing.grade_id = sl.grade_id
    where sl.model_variant_id = source_id
  loop
    perform merge_sku_lines(r.source_sku_id, r.target_sku_id);
  end loop;

  update sku_lines set model_variant_id = target_id where model_variant_id = source_id;
  delete from model_variants where id = source_id;
end;
$$;

create function merge_models(source_id uuid, target_id uuid)
returns void
language plpgsql
as $$
declare
  r record;
begin
  if app_role() <> 'admin' then
    raise exception 'Only an admin can merge models';
  end if;
  if source_id = target_id then
    raise exception 'Cannot merge a model into itself';
  end if;

  for r in
    select v.id as source_variant_id, existing.id as target_variant_id
    from model_variants v
    join model_variants existing on existing.model_id = target_id and lower(existing.color) = lower(v.color)
    where v.model_id = source_id and existing.id <> v.id
  loop
    perform merge_variants(r.source_variant_id, r.target_variant_id);
  end loop;

  update model_variants set model_id = target_id where model_id = source_id;
  delete from models where id = source_id;
end;
$$;

create function merge_brands(source_id uuid, target_id uuid)
returns void
language plpgsql
as $$
declare
  r record;
begin
  if app_role() <> 'admin' then
    raise exception 'Only an admin can merge brands';
  end if;
  if source_id = target_id then
    raise exception 'Cannot merge a brand into itself';
  end if;

  for r in
    select m.id as source_model_id, existing.id as target_model_id
    from models m
    join models existing on existing.brand_id = target_id and lower(existing.name) = lower(m.name)
    where m.brand_id = source_id and existing.id <> m.id
  loop
    perform merge_models(r.source_model_id, r.target_model_id);
  end loop;

  update models set brand_id = target_id where brand_id = source_id;
  delete from brands where id = source_id;
end;
$$;
