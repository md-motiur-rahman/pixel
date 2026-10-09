-- ASIN numbers per inventory line + "empty inventory".
-- Run once in the Supabase SQL editor, AFTER migration_4_serials_and_count_fixes.sql.

-- ─────────────────────────────────────────────────────────────
-- 1. ASINs: each SKU line (brand · model · colour · grade — one row of the
--    inventory table) has 1 required + up to 2 extra ASINs. "Required" is
--    enforced when saving (set_sku_line_asins refuses an empty list); lines
--    that existed before this migration simply start with none and show an
--    "Add ASIN" prompt.
-- ─────────────────────────────────────────────────────────────
create table if not exists sku_line_asins (
  id uuid primary key default gen_random_uuid(),
  sku_line_id uuid not null references sku_lines (id) on delete cascade,
  asin text not null check (asin ~ '^[A-Z0-9]{10}$'),
  position smallint not null check (position between 1 and 3),  -- 1 = main ASIN
  created_at timestamptz not null default now(),
  unique (sku_line_id, position),
  unique (sku_line_id, asin)
);

alter table sku_line_asins enable row level security;

drop policy if exists sku_line_asins_admin_read on sku_line_asins;
create policy sku_line_asins_admin_read on sku_line_asins for select using (app_role() = 'admin');
-- No insert/update/delete policies on purpose: rows are only written through
-- set_sku_line_asins() below.

-- Replaces a line's ASINs in one transaction. Blank entries are ignored; the
-- first non-blank one becomes the main ASIN (position 1).
create or replace function set_sku_line_asins(p_sku_line_id uuid, p_asins text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item text;
  v_asin text;
  v_clean text[] := '{}';
begin
  if app_role() is distinct from 'admin' then
    raise exception 'Only an admin can edit ASINs';
  end if;
  if not exists (select 1 from sku_lines where id = p_sku_line_id) then
    raise exception 'That stock line no longer exists';
  end if;

  foreach v_item in array coalesce(p_asins, '{}') loop
    v_asin := upper(btrim(coalesce(v_item, '')));
    if v_asin = '' then
      continue;
    end if;
    if v_asin !~ '^[A-Z0-9]{10}$' then
      raise exception 'ASIN "%" is not valid — it must be exactly 10 letters or numbers', v_asin;
    end if;
    if v_asin = any (v_clean) then
      raise exception 'ASIN % is listed more than once', v_asin;
    end if;
    v_clean := v_clean || v_asin;
  end loop;

  if coalesce(array_length(v_clean, 1), 0) < 1 then
    raise exception 'At least one ASIN is required';
  end if;
  if array_length(v_clean, 1) > 3 then
    raise exception 'A line can have at most 3 ASINs';
  end if;

  delete from sku_line_asins where sku_line_id = p_sku_line_id;
  insert into sku_line_asins (sku_line_id, asin, position)
  select p_sku_line_id, t.asin, t.pos::smallint
  from unnest(v_clean) with ordinality as t(asin, pos);
end;
$$;

revoke all on function set_sku_line_asins(uuid, text[]) from public;
grant execute on function set_sku_line_asins(uuid, text[]) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. Merging two SKU lines keeps the source line's ASINs too (without
--    duplicates, and never more than 3 on the surviving line), as well as its
--    manual stock adjustment and adjustment history.
-- ─────────────────────────────────────────────────────────────
create or replace function merge_sku_lines(source_id uuid, target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_adjustment int;
  r record;
  v_next smallint;
begin
  if app_role() <> 'admin' then
    raise exception 'Only an admin can merge SKU lines';
  end if;

  select quantity_adjustment into v_source_adjustment from sku_lines where id = source_id;

  -- Carry the source's ASINs over, in order, while there's room and no duplicate.
  for r in select asin from sku_line_asins where sku_line_id = source_id order by position loop
    if not exists (select 1 from sku_line_asins where sku_line_id = target_id and asin = r.asin) then
      select min(p) into v_next
      from generate_series(1, 3) as p
      where not exists (select 1 from sku_line_asins where sku_line_id = target_id and position = p);
      if v_next is not null then
        insert into sku_line_asins (sku_line_id, asin, position) values (target_id, r.asin, v_next);
      end if;
    end if;
  end loop;

  update stock_adjustments set sku_line_id = target_id where sku_line_id = source_id;
  update units set sku_line_id = target_id where sku_line_id = source_id;
  update sku_lines
  set quantity_adjustment = quantity_adjustment + coalesce(v_source_adjustment, 0)
  where id = target_id;
  perform recompute_sku_line_quantity(target_id);
  delete from sku_lines where id = source_id;  -- any leftover source ASINs go with it (on delete cascade)
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Empty the inventory: permanently deletes every IN-STOCK camera record.
--
-- Kept: picked/shipped cameras (history), the catalog (brands/models/colours/
-- SKU lines), ASINs and the adjustment log. Their stock-count scans are
-- deleted with them (a scan can't outlive its camera).
--
-- This function is executable by the service role ONLY — the app calls it from
-- a server action that has first re-checked the admin's password. If it were
-- callable by signed-in users, an admin could skip that check by calling it
-- directly. p_admin_id is who confirmed it, recorded in the adjustment log.
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

  if not exists (select 1 from profiles where id = p_admin_id and role = 'admin' and is_active) then
    raise exception 'Only an active admin can empty the inventory';
  end if;

  insert into stock_adjustments (sku_line_id, adjusted_by, old_quantity, new_quantity, source, note)
  select id, p_admin_id, quantity, 0, 'inventory', 'Inventory emptied'
  from sku_lines
  where quantity > 0;

  delete from stock_count_scans
  where unit_id in (select id from units where status = 'in_stock');

  with removed as (
    delete from units where status = 'in_stock' returning 1
  )
  select count(*) into v_deleted from removed;

  update sku_lines
  set quantity_adjustment = 0, quantity = 0
  where quantity <> 0 or quantity_adjustment <> 0;

  return v_deleted;
end;
$$;

revoke all on function empty_inventory(uuid) from public, anon, authenticated;
grant execute on function empty_inventory(uuid) to service_role;
