-- Multiple roles per person, a "master stocker" role, a master stock list of
-- picked cameras (with selling price), and a buying price on every tested camera.
-- Run once in the Supabase SQL editor, AFTER migration_8_optional_serial_and_zero_stock.sql.
-- Run this BEFORE deploying the matching app code — the app now reads profiles.roles.

-- ─────────────────────────────────────────────────────────────
-- 1. Several roles per person. `roles` is the source of truth; `role` stays as
--    the person's PRIMARY role (admin if they have it, otherwise the first one
--    listed) so the landing page and older code keep working. A trigger keeps the
--    two in step — including a plain `update profiles set role = '...'`.
-- ─────────────────────────────────────────────────────────────
alter table profiles add column if not exists roles text[] not null default '{}';

update profiles set roles = array[role] where cardinality(roles) = 0;

-- Replace the old single-role check (its name was generated) with ones for both columns.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table profiles
  add constraint profiles_role_check
  check (role in ('admin', 'tester', 'dispatcher', 'checker', 'data_entry', 'master_stocker'));

alter table profiles
  add constraint profiles_roles_check
  check (
    cardinality(roles) >= 1
    and roles <@ array['admin', 'tester', 'dispatcher', 'checker', 'data_entry', 'master_stocker']
  );

create or replace function sync_profile_roles()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.roles is null or cardinality(new.roles) = 0 then
      new.roles := array[new.role];
    end if;
  elsif new.roles is not distinct from old.roles and new.role is distinct from old.role then
    -- Someone changed only the single `role` column: that becomes their one role.
    new.roles := array[new.role];
  end if;

  new.role := case when 'admin' = any (new.roles) then 'admin' else new.roles[1] end;
  return new;
end;
$$;

drop trigger if exists profiles_sync_roles on profiles;
create trigger profiles_sync_roles
  before insert or update on profiles
  for each row execute procedure sync_profile_roles();

-- New staff can be invited with several roles (metadata `roles` array); a single
-- `role` still works.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_roles text[];
begin
  if jsonb_typeof(new.raw_user_meta_data->'roles') = 'array' then
    select coalesce(array_agg(t.r), '{}') into v_roles
    from jsonb_array_elements_text(new.raw_user_meta_data->'roles') as t(r);
  end if;
  if v_roles is null or cardinality(v_roles) = 0 then
    v_roles := array[coalesce(new.raw_user_meta_data->>'role', 'tester')];
  end if;

  insert into public.profiles (id, full_name, email, role, roles)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, ''),
    coalesce(new.email, ''),
    v_roles[1],
    v_roles
  );
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Role checks for row level security.
--    app_role() keeps working for the "admin only" checks written earlier: it
--    says 'admin' for anyone who is an admin, whatever their other roles.
--    has_any_role() is for "any of these roles" checks; an admin always passes.
-- ─────────────────────────────────────────────────────────────
create or replace function app_role()
returns text
language sql
security definer set search_path = public
stable
as $$
  select case when 'admin' = any (roles) then 'admin' else role end
  from profiles where id = auth.uid();
$$;

create or replace function has_any_role(p_roles text[])
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce(
    (select is_active and ('admin' = any (roles) or roles && p_roles) from profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function has_any_role(text[]) from public, anon;
grant execute on function has_any_role(text[]) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. Re-create the policies that named a single role, so someone with several
--    roles (e.g. tester + dispatcher) gets what each of them allows.
-- ─────────────────────────────────────────────────────────────
drop policy if exists catalog_write_brands on brands;
create policy catalog_write_brands on brands for insert
  with check (has_any_role(array['tester', 'data_entry']));

drop policy if exists catalog_write_models on models;
create policy catalog_write_models on models for insert
  with check (has_any_role(array['tester', 'data_entry']));

drop policy if exists catalog_write_variants on model_variants;
create policy catalog_write_variants on model_variants for insert
  with check (has_any_role(array['tester']));

drop policy if exists sku_lines_write on sku_lines;
create policy sku_lines_write on sku_lines for insert
  with check (has_any_role(array['tester']));

drop policy if exists sku_lines_update on sku_lines;
create policy sku_lines_update on sku_lines for update
  using (has_any_role(array['tester', 'dispatcher']));

drop policy if exists units_insert on units;
create policy units_insert on units for insert
  with check (has_any_role(array['tester']));

drop policy if exists units_update on units;
create policy units_update on units for update
  using (has_any_role(array['tester', 'dispatcher']));

drop policy if exists stock_counts_write on stock_counts;
create policy stock_counts_write on stock_counts for insert
  with check (has_any_role(array['checker']));

drop policy if exists model_asins_insert on model_asins;
create policy model_asins_insert on model_asins for insert
  with check (has_any_role(array['data_entry']));

drop policy if exists model_asins_delete on model_asins;
create policy model_asins_delete on model_asins for delete
  using (has_any_role(array['data_entry']));

-- Functions that checked the caller's single role.
create or replace function attach_model_asin_to_variant(p_variant_id uuid, p_asin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_model_id uuid;
  v_asin text := upper(btrim(coalesce(p_asin, '')));
  v_next smallint;
begin
  if not has_any_role(array['tester']) then
    raise exception 'Only a tester or admin can do that';
  end if;

  select model_id into v_model_id from model_variants where id = p_variant_id;
  if v_model_id is null then
    raise exception 'That model and colour no longer exists';
  end if;

  if not exists (select 1 from model_asins where model_id = v_model_id and asin = v_asin) then
    raise exception 'ASIN % is not one of this model''s ASINs', v_asin;
  end if;

  if exists (select 1 from variant_asins where variant_id = p_variant_id and asin = v_asin) then
    return;
  end if;

  select min(p) into v_next
  from generate_series(1, 3) as p
  where not exists (select 1 from variant_asins where variant_id = p_variant_id and position = p);

  if v_next is not null then
    insert into variant_asins (variant_id, asin, position) values (p_variant_id, v_asin, v_next);
  end if;
end;
$$;

create or replace function adjust_sku_line_quantity(
  p_sku_line_id uuid,
  p_new_quantity int,
  p_expected_quantity int,
  p_source text,
  p_stock_count_id uuid default null,
  p_note text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := app_role();
  v_current int;
  v_in_stock int;
begin
  if auth.uid() is null or v_role is null then
    raise exception 'Not signed in';
  end if;
  if p_new_quantity is null or p_new_quantity < 0 then
    raise exception 'Quantity cannot be negative';
  end if;

  if p_source = 'inventory' then
    if v_role <> 'admin' then
      raise exception 'Only an admin can edit inventory';
    end if;
  elsif p_source = 'stock_count' then
    if not has_any_role(array['checker']) then
      raise exception 'Only a checker or admin can adjust from a stock count';
    end if;
    if p_stock_count_id is null or not exists (
      select 1 from stock_counts sc
      where sc.id = p_stock_count_id
        and sc.finished_at is null
        and (sc.checker_id = auth.uid() or v_role = 'admin')
    ) then
      raise exception 'This count session is not open, or is not yours';
    end if;
  else
    raise exception 'Unknown adjustment source';
  end if;

  select quantity into v_current from sku_lines where id = p_sku_line_id for update;
  if not found then
    raise exception 'That stock line no longer exists';
  end if;
  if v_current <> p_expected_quantity then
    raise exception 'Stock changed to % while you were looking — review and try again', v_current;
  end if;

  select count(*) into v_in_stock from units where sku_line_id = p_sku_line_id and status = 'in_stock';

  update sku_lines
  set quantity_adjustment = p_new_quantity - v_in_stock,
      quantity = p_new_quantity
  where id = p_sku_line_id;

  insert into stock_adjustments (sku_line_id, adjusted_by, old_quantity, new_quantity, source, stock_count_id, note)
  values (p_sku_line_id, auth.uid(), v_current, p_new_quantity, p_source, p_stock_count_id, nullif(btrim(p_note), ''));

  return p_new_quantity;
end;
$$;

create or replace function resolve_stock_count_line(
  p_stock_count_id uuid,
  p_sku_line_id uuid,
  p_expected_quantity int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := app_role();
  v_current int;
  v_restored int;
  v_scanned int;
  v_in_stock int;
begin
  if auth.uid() is null or v_role is null then
    raise exception 'Not signed in';
  end if;
  if not has_any_role(array['checker']) then
    raise exception 'Only a checker or admin can adjust from a stock count';
  end if;
  if not exists (
    select 1 from stock_counts sc
    where sc.id = p_stock_count_id
      and sc.finished_at is null
      and (sc.checker_id = auth.uid() or v_role = 'admin')
  ) then
    raise exception 'This count session is not open, or is not yours';
  end if;

  select quantity into v_current from sku_lines where id = p_sku_line_id for update;
  if not found then
    raise exception 'That stock line no longer exists';
  end if;
  if v_current <> p_expected_quantity then
    raise exception 'Stock changed to % while you were looking — review and try again', v_current;
  end if;

  -- Scanned on the shelf but recorded as picked/shipped: physically here, so back in stock.
  with restored as (
    update units u
    set status = 'in_stock', picked_by = null, picked_at = null
    where u.sku_line_id = p_sku_line_id
      and u.status <> 'in_stock'
      and exists (
        select 1 from stock_count_scans s
        where s.stock_count_id = p_stock_count_id and s.unit_id = u.id
      )
    returning 1
  )
  select count(*) into v_restored from restored;

  select count(*) into v_scanned
  from stock_count_scans s
  join units u on u.id = s.unit_id
  where s.stock_count_id = p_stock_count_id and u.sku_line_id = p_sku_line_id;

  select count(*) into v_in_stock from units where sku_line_id = p_sku_line_id and status = 'in_stock';

  -- Every scanned unit is now in stock, so v_in_stock >= v_scanned and this is <= 0.
  update sku_lines
  set quantity_adjustment = v_scanned - v_in_stock,
      quantity = v_scanned
  where id = p_sku_line_id;

  insert into stock_adjustments (sku_line_id, adjusted_by, old_quantity, new_quantity, source, stock_count_id, note)
  values (
    p_sku_line_id,
    auth.uid(),
    v_current,
    v_scanned,
    'stock_count',
    p_stock_count_id,
    case
      when v_restored > 0 then format('Stock count: %s picked/shipped camera(s) found on the shelf put back in stock', v_restored)
      else 'Stock count adjustment'
    end
  );

  return v_scanned;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. Buying price: entered by the tester when a camera is tested. Nullable only
--    because cameras tested before this change have none.
-- ─────────────────────────────────────────────────────────────
alter table units add column if not exists buying_price numeric(10, 2);

alter table units drop constraint if exists units_buying_price_check;
alter table units
  add constraint units_buying_price_check check (buying_price is null or buying_price >= 0);

-- ─────────────────────────────────────────────────────────────
-- 5. Master stock: one row per camera a picker has picked. The row is created by
--    the database the moment a camera becomes "picked" (however that happens) and
--    removed if the pick is undone or the camera is put back in stock. The master
--    stocker then fills in the selling price — and the serial number, if the
--    camera has none — through set_master_stock_details() below.
-- ─────────────────────────────────────────────────────────────
create table if not exists master_stock (
  unit_id uuid primary key references units (id) on delete cascade,
  picked_by uuid references profiles (id) on delete set null,
  picked_at timestamptz not null default now(),
  selling_price numeric(10, 2) check (selling_price is null or selling_price >= 0),
  priced_by uuid references profiles (id) on delete set null,
  priced_at timestamptz
);

create index if not exists master_stock_picked_at_idx on master_stock (picked_at desc);
create index if not exists master_stock_unpriced_idx on master_stock (picked_at desc) where selling_price is null;

alter table master_stock enable row level security;

-- Master stockers (and admins) read the list. Nobody writes to it directly:
-- rows come from the trigger and prices from the function below.
drop policy if exists master_stock_read on master_stock;
create policy master_stock_read on master_stock for select
  using (has_any_role(array['master_stocker']));

create or replace function sync_master_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'picked' then
    insert into master_stock (unit_id, picked_by, picked_at)
    values (new.id, new.picked_by, coalesce(new.picked_at, now()))
    on conflict (unit_id) do nothing;
  elsif new.status = 'in_stock' then
    delete from master_stock where unit_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists units_sync_master_stock on units;
create trigger units_sync_master_stock
  after update of status on units
  for each row
  when (old.status is distinct from new.status)
  execute procedure sync_master_stock();

-- Cameras already picked or shipped before this change go on the list too.
insert into master_stock (unit_id, picked_by, picked_at)
select id, picked_by, coalesce(picked_at, tested_at)
from units
where status in ('picked', 'shipped')
on conflict (unit_id) do nothing;

-- Save a camera's selling price and/or its serial number (when it has none). Both
-- are optional: a null price leaves the stored price as it is. Runs as
-- the database owner but checks the caller's role itself, and can change nothing
-- except those two things on a camera that is on the master stock list.
create or replace function set_master_stock_details(
  p_unit_id uuid,
  p_selling_price numeric default null,
  p_serial text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_serial text := nullif(btrim(coalesce(p_serial, '')), '');
  v_current_serial text;
begin
  if not has_any_role(array['master_stocker']) then
    raise exception 'Only a master stocker can do that';
  end if;
  if p_selling_price is not null and p_selling_price < 0 then
    raise exception 'The selling price cannot be negative';
  end if;

  if not exists (select 1 from master_stock where unit_id = p_unit_id) then
    raise exception 'That camera is not on the master stock list';
  end if;

  select serial_number into v_current_serial from units where id = p_unit_id for update;

  -- A serial that is already recorded is never changed from here.
  if v_serial is not null and v_current_serial is null then
    update units set serial_number = v_serial where id = p_unit_id;
  end if;

  if p_selling_price is not null then
    update master_stock
    set selling_price = round(p_selling_price, 2),
        priced_by = auth.uid(),
        priced_at = now()
    where unit_id = p_unit_id;
  end if;
end;
$$;

revoke all on function set_master_stock_details(uuid, numeric, text) from public, anon;
grant execute on function set_master_stock_details(uuid, numeric, text) to authenticated;
