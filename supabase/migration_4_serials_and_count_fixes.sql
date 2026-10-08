-- Serial-number uniqueness + stock-count adjustment fixes.
-- Run once in the Supabase SQL editor, AFTER migration_3_stock_adjustments.sql.

-- ─────────────────────────────────────────────────────────────
-- 1. Serial numbers are unique regardless of upper/lower case and
--    surrounding spaces. The app looks serials up case-insensitively, so
--    "abc123" and "ABC123" must not be able to exist as two cameras.
-- ─────────────────────────────────────────────────────────────
do $$
declare
  dupes text;
begin
  select string_agg(serials, '; ') into dupes
  from (
    select string_agg(serial_number, ', ') as serials
    from units
    group by lower(btrim(serial_number))
    having count(*) > 1
  ) d;

  if dupes is not null then
    raise exception
      'These serial numbers differ only by upper/lower case or spaces. Fix them (Tester → Find a saved camera) and run this migration again: %',
      dupes;
  end if;
end;
$$;

create unique index if not exists units_serial_number_ci_key on units (lower(btrim(serial_number)));

-- ─────────────────────────────────────────────────────────────
-- 2. Resolving a stock-count difference for one line.
--
-- Every scanned camera has a QR, so it already has a unit record. Scanned can
-- only exceed the system figure when some scanned cameras are recorded as
-- picked/shipped while physically on the shelf — the correct fix is to put
-- those units back in stock, NOT to add a number (a positive number would be
-- double-counted the moment someone undid the pick).
--
-- After that, any remaining gap is in-stock records that weren't found on the
-- shelf; that part is stored as a (never positive) quantity_adjustment so the
-- system figure matches what was physically counted.
-- ─────────────────────────────────────────────────────────────
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
  if v_role not in ('admin', 'checker') then
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

revoke all on function resolve_stock_count_line(uuid, uuid, int) from public;
grant execute on function resolve_stock_count_line(uuid, uuid, int) to authenticated;
