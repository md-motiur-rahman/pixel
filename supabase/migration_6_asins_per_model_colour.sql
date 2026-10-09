-- ASINs belong to a model + colour (one row of the inventory table), not to each
-- grade. Run once in the Supabase SQL editor, AFTER migration_5_asins_and_empty_inventory.sql.
--
-- Safe whether or not any ASINs were entered under migration 5: existing ones are
-- carried over to their model + colour (at most 3 each, duplicates dropped).

-- ─────────────────────────────────────────────────────────────
-- 1. New table: 1 required + up to 2 extra ASINs per model + colour.
-- ─────────────────────────────────────────────────────────────
create table if not exists variant_asins (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references model_variants (id) on delete cascade,
  asin text not null check (asin ~ '^[A-Z0-9]{10}$'),
  position smallint not null check (position between 1 and 3),  -- 1 = main ASIN
  created_at timestamptz not null default now(),
  unique (variant_id, position),
  unique (variant_id, asin)
);

alter table variant_asins enable row level security;

drop policy if exists variant_asins_admin_read on variant_asins;
create policy variant_asins_admin_read on variant_asins for select using (app_role() = 'admin');
-- No write policies on purpose: rows are only written through set_variant_asins().

-- ─────────────────────────────────────────────────────────────
-- 2. Carry over anything entered per grade under migration 5, then retire it.
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.sku_line_asins') is not null then
    insert into variant_asins (variant_id, asin, position)
    select variant_id, asin, rn::smallint
    from (
      select
        variant_id,
        asin,
        row_number() over (partition by variant_id order by min_pos, asin) as rn
      from (
        select sl.model_variant_id as variant_id, a.asin, min(a.position) as min_pos
        from sku_line_asins a
        join sku_lines sl on sl.id = a.sku_line_id
        group by sl.model_variant_id, a.asin
      ) d
    ) ranked
    where rn <= 3
    on conflict do nothing;

    drop table sku_line_asins;
  end if;
end;
$$;

drop function if exists set_sku_line_asins(uuid, text[]);

-- ─────────────────────────────────────────────────────────────
-- 3. Replace a model + colour's ASINs in one transaction. Blank entries are
--    ignored; the first one is the main ASIN. At least one is required.
-- ─────────────────────────────────────────────────────────────
create or replace function set_variant_asins(p_variant_id uuid, p_asins text[])
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
  if not exists (select 1 from model_variants where id = p_variant_id) then
    raise exception 'That model and colour no longer exists';
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
    raise exception 'A row can have at most 3 ASINs';
  end if;

  delete from variant_asins where variant_id = p_variant_id;
  insert into variant_asins (variant_id, asin, position)
  select p_variant_id, t.asin, t.pos::smallint
  from unnest(v_clean) with ordinality as t(asin, pos);
end;
$$;

revoke all on function set_variant_asins(uuid, text[]) from public;
grant execute on function set_variant_asins(uuid, text[]) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. Merges. SKU lines no longer carry ASINs (back to carrying the manual stock
--    adjustment + history); merging two colours carries the source's ASINs to
--    the surviving one — no duplicates, never more than 3.
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

create or replace function merge_variants(source_id uuid, target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_next smallint;
begin
  if app_role() <> 'admin' then
    raise exception 'Only an admin can merge colors';
  end if;
  if source_id = target_id then
    raise exception 'Cannot merge a color into itself';
  end if;

  -- Carry the source's ASINs over, in order, while there's room and no duplicate.
  for r in select asin from variant_asins where variant_id = source_id order by position loop
    if not exists (select 1 from variant_asins where variant_id = target_id and asin = r.asin) then
      select min(p) into v_next
      from generate_series(1, 3) as p
      where not exists (select 1 from variant_asins where variant_id = target_id and position = p);
      if v_next is not null then
        insert into variant_asins (variant_id, asin, position) values (target_id, r.asin, v_next);
      end if;
    end if;
  end loop;

  -- Same-grade SKU lines merge into the target's line; the rest simply move over.
  for r in
    select sl.id as source_sku_id, existing.id as target_sku_id
    from sku_lines sl
    join sku_lines existing on existing.model_variant_id = target_id and existing.grade_id = sl.grade_id
    where sl.model_variant_id = source_id
  loop
    perform merge_sku_lines(r.source_sku_id, r.target_sku_id);
  end loop;

  update sku_lines set model_variant_id = target_id where model_variant_id = source_id;
  delete from model_variants where id = source_id;  -- leftover source ASINs go with it (on delete cascade)
end;
$$;
