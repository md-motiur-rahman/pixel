-- Delete one inventory entry (a model + colour) that was added by mistake.
-- Run once in the Supabase SQL editor, AFTER migration_10_master_stock_hold.sql.
-- Safe to run more than once.
--
-- Removes the model + colour, its stock lines (all grades), its ASINs, its
-- adjustment history and its in-stock camera records. Then, if nothing else uses
-- them any more, the model itself (only when data entry hasn't given it ASINs)
-- and the brand.
--
-- Refused when any camera of this model + colour has been picked or shipped:
-- that's real sales history (and may be on the master stock list). Move those
-- cameras to the right model first (Tester → Find a saved camera), then delete.
--
-- Executable by the service role ONLY — the app calls it after re-checking the
-- admin's password, so that check can't be skipped by calling it directly.
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
    raise exception 'Some items of this model and colour have already been picked or shipped, so it can''t be deleted. Move those items to the right model first (Tester → Find a saved item).';
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

  -- Stock lines take their adjustment log and ASINs with them (on delete cascade);
  -- the model + colour takes its own ASINs.
  delete from sku_lines where model_variant_id = p_variant_id;
  delete from model_variants where id = p_variant_id;

  -- The model goes too if this was its only colour — unless data entry gave it
  -- ASINs, which means it's a real model that's meant to be there.
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
