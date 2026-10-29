-- Picked cameras are ON HOLD until the master stocker accepts them.
-- Run once in the Supabase SQL editor, AFTER migration_9_multi_role_master_stock.sql.
-- Safe to run more than once.
--
-- How it works:
--   * A dispatcher picks a camera → it goes on the master stock list as "waiting"
--     and STILL COUNTS in its line's stock quantity (it's on hold, not gone).
--   * The master stocker saves it (price and serial are both optional) → it is
--     accepted, and only now does the stock quantity go down.
--   * The master stocker refuses it → the camera is put back in stock exactly as
--     if the pick had been undone, and it leaves the master stock list.

-- ─────────────────────────────────────────────────────────────
-- 1. Accepted marker. Rows already on the list when this first runs were picked
--    under the old rules (stock already went down for them), so they start out
--    accepted — otherwise every one of them would suddenly add stock back.
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'master_stock' and column_name = 'accepted_at'
  ) then
    alter table master_stock add column accepted_at timestamptz;
    alter table master_stock add column accepted_by uuid references profiles (id) on delete set null;
    update master_stock set accepted_at = coalesce(priced_at, picked_at);
  end if;
end;
$$;

create index if not exists master_stock_waiting_idx on master_stock (picked_at desc) where accepted_at is null;

-- ─────────────────────────────────────────────────────────────
-- 2. What counts as stock: cameras in stock + picked cameras still on hold.
--    Every place that worked a quantity out from "in stock" units now uses this.
-- ─────────────────────────────────────────────────────────────
create or replace function counted_unit_total(p_sku_line_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from units u
  where u.sku_line_id = p_sku_line_id
    and (
      u.status = 'in_stock'
      or (
        u.status = 'picked'
        and exists (select 1 from master_stock ms where ms.unit_id = u.id and ms.accepted_at is null)
      )
    );
$$;

create or replace function recompute_sku_line_quantity(p_sku_line_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update sku_lines
  set quantity = greatest(0, counted_unit_total(p_sku_line_id) + quantity_adjustment)
  where id = p_sku_line_id;
$$;

-- Accepting, refusing or adding a camera to the list changes what counts — recompute its line.
create or replace function sync_quantity_from_master_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit_id uuid := case when tg_op = 'DELETE' then old.unit_id else new.unit_id end;
  v_line uuid;
begin
  select sku_line_id into v_line from units where id = v_unit_id;
  if v_line is not null then
    perform recompute_sku_line_quantity(v_line);
  end if;
  return null;
end;
$$;

drop trigger if exists master_stock_sync_quantity on master_stock;
create trigger master_stock_sync_quantity
  after insert or delete or update of accepted_at on master_stock
  for each row execute procedure sync_quantity_from_master_stock();

-- ─────────────────────────────────────────────────────────────
-- 3. The stock tools that set a quantity by hand: same maths, held cameras counted.
-- ─────────────────────────────────────────────────────────────
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
  v_counted int;
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

  v_counted := counted_unit_total(p_sku_line_id);

  update sku_lines
  set quantity_adjustment = p_new_quantity - v_counted,
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
  v_counted int;
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

  v_counted := counted_unit_total(p_sku_line_id);

  -- Every scanned unit now counts, so v_counted >= v_scanned and this is <= 0.
  update sku_lines
  set quantity_adjustment = v_scanned - v_counted,
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

create or replace function zero_inventory(p_admin_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lines int;
begin
  perform set_config('statement_timeout', '300s', true);

  if not exists (select 1 from profiles where id = p_admin_id and role = 'admin' and is_active) then
    raise exception 'Only an active admin can zero the stock';
  end if;

  insert into stock_adjustments (sku_line_id, adjusted_by, old_quantity, new_quantity, source, note)
  select id, p_admin_id, quantity, 0, 'inventory', 'Stock zeroed'
  from sku_lines
  where quantity > 0;

  get diagnostics v_lines = row_count;

  update sku_lines
  set quantity_adjustment = - counted_unit_total(sku_lines.id),
      quantity = 0
  -- Supabase rejects an UPDATE with no WHERE clause, so only touch lines that aren't already at zero.
  where quantity <> 0
     or quantity_adjustment <> 0
     or counted_unit_total(sku_lines.id) > 0;

  return v_lines;
end;
$$;

revoke all on function zero_inventory(uuid) from public, anon, authenticated;
grant execute on function zero_inventory(uuid) to service_role;

-- Emptying deletes in-stock cameras. Cameras on hold with the master stocker are
-- not deleted (they're mid-way through being processed), so they still count.
create or replace function empty_inventory(p_admin_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  perform set_config('statement_timeout', '300s', true);

  if not exists (select 1 from profiles where id = p_admin_id and role = 'admin' and is_active) then
    raise exception 'Only an active admin can empty the inventory';
  end if;

  insert into stock_adjustments (sku_line_id, adjusted_by, old_quantity, new_quantity, source, note)
  -- What's left afterwards is only the cameras on hold.
  select sl.id, p_admin_id, sl.quantity, (
      select count(*)::int
      from units u
      join master_stock ms on ms.unit_id = u.id
      where u.sku_line_id = sl.id and u.status = 'picked' and ms.accepted_at is null
    ), 'inventory', 'Inventory emptied'
  from sku_lines sl
  where sl.quantity > 0;

  delete from stock_count_scans
  where unit_id in (select id from units where status = 'in_stock');

  with removed as (
    delete from units where status = 'in_stock' returning 1
  )
  select count(*) into v_deleted from removed;

  update sku_lines
  set quantity_adjustment = 0,
      quantity = counted_unit_total(sku_lines.id)
  where quantity <> 0 or quantity_adjustment <> 0;

  return v_deleted;
end;
$$;

revoke all on function empty_inventory(uuid) from public, anon, authenticated;
grant execute on function empty_inventory(uuid) to service_role;

-- Every line's quantity under the new rule (held cameras now count).
do $$
declare
  r record;
begin
  for r in select distinct sku_line_id from units where status = 'picked' loop
    perform recompute_sku_line_quantity(r.sku_line_id);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. Save = accept. Price and serial are both optional. Accepting is what takes
--    the camera out of stock; saving again later only updates the price/serial.
-- ─────────────────────────────────────────────────────────────
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

  update master_stock
  set accepted_at = coalesce(accepted_at, now()),
      accepted_by = coalesce(accepted_by, auth.uid()),
      selling_price = coalesce(round(p_selling_price, 2), selling_price),
      priced_by = case when p_selling_price is null then priced_by else auth.uid() end,
      priced_at = case when p_selling_price is null then priced_at else now() end
  where unit_id = p_unit_id;
end;
$$;

revoke all on function set_master_stock_details(uuid, numeric, text) from public, anon;
grant execute on function set_master_stock_details(uuid, numeric, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. Refuse = send the camera back to stock, exactly like undoing the pick. The
--    existing triggers take it off the master stock list and put its quantity back.
-- ─────────────────────────────────────────────────────────────
create or replace function refuse_master_stock(p_unit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_any_role(array['master_stocker']) then
    raise exception 'Only a master stocker can do that';
  end if;
  if not exists (select 1 from master_stock where unit_id = p_unit_id) then
    raise exception 'That camera is not on the master stock list';
  end if;

  update units
  set status = 'in_stock', picked_by = null, picked_at = null
  where id = p_unit_id;

  -- Belt and braces: if the camera was somehow already in stock, the status
  -- trigger wouldn't fire — make sure it leaves the list either way.
  delete from master_stock where unit_id = p_unit_id;
end;
$$;

revoke all on function refuse_master_stock(uuid) from public, anon;
grant execute on function refuse_master_stock(uuid) to authenticated;
