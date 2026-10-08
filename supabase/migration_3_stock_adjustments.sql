-- Manual stock adjustments (admin inventory edit + checker "adjust" after a count).
-- Run once in the Supabase SQL editor, after schema.sql and migration_2_admin_tools.sql.
--
-- Why this isn't just "UPDATE sku_lines SET quantity = n":
-- sku_lines.quantity is derived — a trigger recomputes it from the count of
-- in_stock units whenever a unit changes, so a directly written number would be
-- silently overwritten by the next pick or test. Instead the manual correction
-- is stored as quantity_adjustment and the trigger computes
--   quantity = max(0, in_stock units + quantity_adjustment)
-- so a correction survives later picks/tests.

alter table sku_lines add column if not exists quantity_adjustment int not null default 0;

-- ─────────────────────────────────────────────────────────────
-- Single place that recomputes a line's quantity
-- ─────────────────────────────────────────────────────────────
create or replace function recompute_sku_line_quantity(p_sku_line_id uuid)
returns void
language sql
as $$
  update sku_lines
  set quantity = greatest(
    0,
    (select count(*) from units where sku_line_id = p_sku_line_id and status = 'in_stock') + quantity_adjustment
  )
  where id = p_sku_line_id;
$$;

create or replace function sync_sku_line_quantity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform recompute_sku_line_quantity(old.sku_line_id);
    return old;
  end if;

  perform recompute_sku_line_quantity(new.sku_line_id);

  if tg_op = 'UPDATE' and old.sku_line_id is distinct from new.sku_line_id then
    perform recompute_sku_line_quantity(old.sku_line_id);
  end if;

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Audit log of every manual adjustment
-- ─────────────────────────────────────────────────────────────
create table if not exists stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  sku_line_id uuid not null references sku_lines (id) on delete cascade,
  adjusted_by uuid not null references profiles (id),
  old_quantity int not null,
  new_quantity int not null,
  source text not null check (source in ('inventory', 'stock_count')),
  stock_count_id uuid references stock_counts (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists stock_adjustments_sku_line_idx on stock_adjustments (sku_line_id, created_at desc);

alter table stock_adjustments enable row level security;

drop policy if exists stock_adjustments_admin_read on stock_adjustments;
create policy stock_adjustments_admin_read on stock_adjustments for select using (app_role() = 'admin');
-- No insert/update/delete policies on purpose: rows are only written by
-- adjust_sku_line_quantity() below (security definer).

-- ─────────────────────────────────────────────────────────────
-- The one entry point for changing a line's stock number
-- ─────────────────────────────────────────────────────────────
-- p_expected_quantity is what the person saw when they confirmed; if the stock
-- has moved since (a pick, a test, another adjustment) the change is refused
-- rather than silently overwriting it.
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
    if v_role not in ('admin', 'checker') then
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

revoke all on function adjust_sku_line_quantity(uuid, int, int, text, uuid, text) from public;
grant execute on function adjust_sku_line_quantity(uuid, int, int, text, uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Merging two SKU lines must not lose the source line's manual adjustment or
-- its adjustment history.
-- ─────────────────────────────────────────────────────────────
create or replace function merge_sku_lines(source_id uuid, target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_adjustment int;
begin
  if app_role() <> 'admin' then
    raise exception 'Only an admin can merge SKU lines';
  end if;

  select quantity_adjustment into v_source_adjustment from sku_lines where id = source_id;

  update stock_adjustments set sku_line_id = target_id where sku_line_id = source_id;
  update units set sku_line_id = target_id where sku_line_id = source_id;
  update sku_lines
  set quantity_adjustment = quantity_adjustment + coalesce(v_source_adjustment, 0)
  where id = target_id;
  perform recompute_sku_line_quantity(target_id);
  delete from sku_lines where id = source_id;
end;
$$;
