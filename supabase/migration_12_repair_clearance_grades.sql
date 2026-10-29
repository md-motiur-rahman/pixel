-- Two grades that are NOT inventory: D = Repair, E = Clearance.
-- Run once in the Supabase SQL editor, AFTER migration_11_delete_inventory_entry.sql.
-- Safe to run more than once.
--
-- A tester grades a camera D or E like any other grade. Those cameras don't show
-- on the Inventory page (or its totals and CSV); they're listed on the Repair and
-- Clearance pages instead. The inventory-wide tools (zero all stock, empty
-- inventory, delete an entry) leave them alone.

-- ─────────────────────────────────────────────────────────────
-- 1. Grades carry an "is this inventory?" flag.
-- ─────────────────────────────────────────────────────────────
alter table grades add column if not exists in_inventory boolean not null default true;

insert into grades (code, label, sort_order, in_inventory) values
  ('D', 'Grade D – Repair', 4, false),
  ('E', 'Grade E – Clearance', 5, false)
on conflict (code) do update
  set label = excluded.label,
      sort_order = excluded.sort_order,
      in_inventory = false;

-- ─────────────────────────────────────────────────────────────
-- 2. Zero all stock: inventory grades only.
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

  if not exists (select 1 from profiles where id = p_admin_id and 'admin' = any (roles) and is_active) then
    raise exception 'Only an active admin can zero the stock';
  end if;

  insert into stock_adjustments (sku_line_id, adjusted_by, old_quantity, new_quantity, source, note)
  select sl.id, p_admin_id, sl.quantity, 0, 'inventory', 'Stock zeroed'
  from sku_lines sl
  join grades g on g.id = sl.grade_id
  where g.in_inventory and sl.quantity > 0;

  get diagnostics v_lines = row_count;

  update sku_lines
  set quantity_adjustment = - counted_unit_total(sku_lines.id),
      quantity = 0
  where grade_id in (select id from grades where in_inventory)
    and (quantity <> 0 or quantity_adjustment <> 0 or counted_unit_total(sku_lines.id) > 0);

  return v_lines;
end;
$$;

revoke all on function zero_inventory(uuid) from public, anon, authenticated;
grant execute on function zero_inventory(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────
-- 3. Empty inventory: deletes in-stock cameras of inventory grades only — repair
--    and clearance cameras are kept.
-- ─────────────────────────────────────────────────────────────
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

  if not exists (select 1 from profiles where id = p_admin_id and 'admin' = any (roles) and is_active) then
    raise exception 'Only an active admin can empty the inventory';
  end if;

  -- What's left afterwards is only the cameras on hold with the master stocker.
  insert into stock_adjustments (sku_line_id, adjusted_by, old_quantity, new_quantity, source, note)
  select sl.id, p_admin_id, sl.quantity, (
      select count(*)::int
      from units u
      join master_stock ms on ms.unit_id = u.id
      where u.sku_line_id = sl.id and u.status = 'picked' and ms.accepted_at is null
    ), 'inventory', 'Inventory emptied'
  from sku_lines sl
  join grades g on g.id = sl.grade_id
  where g.in_inventory and sl.quantity > 0;

  delete from stock_count_scans
  where unit_id in (
    select u.id from units u
    join sku_lines sl on sl.id = u.sku_line_id
    join grades g on g.id = sl.grade_id
    where u.status = 'in_stock' and g.in_inventory
  );

  with removed as (
    delete from units u
    using sku_lines sl, grades g
    where sl.id = u.sku_line_id and g.id = sl.grade_id
      and u.status = 'in_stock' and g.in_inventory
    returning 1
  )
  select count(*) into v_deleted from removed;

  update sku_lines
  set quantity_adjustment = 0,
      quantity = counted_unit_total(sku_lines.id)
  where grade_id in (select id from grades where in_inventory)
    and (quantity <> 0 or quantity_adjustment <> 0);

  return v_deleted;
end;
$$;

revoke all on function empty_inventory(uuid) from public, anon, authenticated;
grant execute on function empty_inventory(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────
-- 4. Deleting an inventory entry never takes repair/clearance cameras with it.
-- ─────────────────────────────────────────────────────────────
create or replace function delete_inventory_entry(p_admin_id uuid, p_variant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_model_id uuid;
  v_brand_id uuid;
  v_cameras int;
  v_model_removed boolean := false;
  v_brand_removed boolean := false;
begin
  if not exists (select 1 from profiles where id = p_admin_id and 'admin' = any (roles) and is_active) then
    raise exception 'Only an active admin can delete inventory entries';
  end if;

  select mv.model_id, m.brand_id into v_model_id, v_brand_id
  from model_variants mv
  join models m on m.id = mv.model_id
  where mv.id = p_variant_id
  for update of mv;
  if v_model_id is null then
    raise exception 'That entry no longer exists';
  end if;

  if exists (
    select 1 from units u
    join sku_lines sl on sl.id = u.sku_line_id
    where sl.model_variant_id = p_variant_id and u.status <> 'in_stock'
  ) then
    raise exception 'Some cameras of this model and colour have already been picked or shipped, so it can''t be deleted. Move those cameras to the right model first (Tester → Find a saved camera).';
  end if;

  if exists (
    select 1 from units u
    join sku_lines sl on sl.id = u.sku_line_id
    join grades g on g.id = sl.grade_id
    where sl.model_variant_id = p_variant_id and not g.in_inventory
  ) then
    raise exception 'This model and colour also has cameras in Repair or Clearance, so it can''t be deleted. Move or regrade those cameras first (Tester → Find a saved camera).';
  end if;

  delete from stock_count_scans
  where unit_id in (
    select u.id from units u join sku_lines sl on sl.id = u.sku_line_id where sl.model_variant_id = p_variant_id
  );

  with removed as (
    delete from units
    where sku_line_id in (select id from sku_lines where model_variant_id = p_variant_id)
    returning 1
  )
  select count(*) into v_cameras from removed;

  delete from sku_lines where model_variant_id = p_variant_id;
  delete from model_variants where id = p_variant_id;

  if not exists (select 1 from model_variants where model_id = v_model_id)
     and not exists (select 1 from model_asins where model_id = v_model_id) then
    delete from models where id = v_model_id;
    v_model_removed := true;

    if not exists (select 1 from models where brand_id = v_brand_id) then
      delete from brands where id = v_brand_id;
      v_brand_removed := true;
    end if;
  end if;

  return jsonb_build_object(
    'cameras', v_cameras,
    'model_removed', v_model_removed,
    'brand_removed', v_brand_removed
  );
end;
$$;

revoke all on function delete_inventory_entry(uuid, uuid) from public, anon, authenticated;
grant execute on function delete_inventory_entry(uuid, uuid) to service_role;
