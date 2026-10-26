-- Optional serial numbers + a "zero all stock" tool.
-- Run once in the Supabase SQL editor, AFTER migration_7_data_entry_role.sql.

-- ─────────────────────────────────────────────────────────────
-- 1. A camera is identified by its own id (the QR), so its serial number is
--    optional. A missing serial is stored as NULL — never as an empty string —
--    so any number of cameras can have none. Serials that ARE entered stay
--    unique (the existing unique constraint and the case-insensitive index both
--    ignore NULLs).
-- ─────────────────────────────────────────────────────────────
alter table units alter column serial_number drop not null;

update units set serial_number = null where btrim(serial_number) = '';

alter table units drop constraint if exists units_serial_not_blank;
alter table units
  add constraint units_serial_not_blank check (serial_number is null or btrim(serial_number) <> '');

-- ─────────────────────────────────────────────────────────────
-- 2. Zero all stock: every model's quantity becomes 0, WITHOUT deleting any
--    camera. Each camera record stays in stock; the difference is stored as a
--    (negative) quantity_adjustment — the same mechanism a stock-count
--    adjustment uses — so later picks and newly tested cameras keep adding up
--    correctly from zero. Every line that had stock gets a row in the
--    adjustment log.
--
--    Executable by the service role only: the app calls it after re-checking
--    the admin's password, so that check can't be skipped by calling it directly.
-- ─────────────────────────────────────────────────────────────
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
  set quantity_adjustment = - (
        select count(*) from units u where u.sku_line_id = sku_lines.id and u.status = 'in_stock'
      ),
      quantity = 0
  -- Supabase rejects an UPDATE with no WHERE clause ("UPDATE requires a WHERE
  -- clause"), so only touch lines that aren't already at zero.
  where quantity <> 0
     or quantity_adjustment <> 0
     or exists (select 1 from units u where u.sku_line_id = sku_lines.id and u.status = 'in_stock');

  return v_lines;
end;
$$;

revoke all on function zero_inventory(uuid) from public, anon, authenticated;
grant execute on function zero_inventory(uuid) to service_role;
