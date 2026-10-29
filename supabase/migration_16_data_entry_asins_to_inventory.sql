-- Data entry ASINs show in Admin → Inventory.
-- Run once in the Supabase SQL editor, AFTER migration_15_data_entry_variants.sql.
-- Safe to run more than once.
--
-- Data entry keeps its ASINs per model + colour (model_asins); the inventory shows
-- each model + colour's own list (variant_asins: a main ASIN + up to 2 more). From
-- now on the database copies one into the other:
--   • an ASIN data entry adds goes onto that model + colour's inventory line,
--   • a model + colour created later (by data entry or a tester) picks up the
--     ASINs data entry already has for it,
--   • an ASIN data entry removes is taken off the inventory line too.
-- Only the first 3 fit on an inventory line; an admin can still change them there.
-- Older ASINs entered without a colour aren't copied — there's no telling which
-- colour they belong to.

-- ─────────────────────────────────────────────────────────────
-- 1. Put one ASIN on one model + colour, in the first free slot (if any).
-- ─────────────────────────────────────────────────────────────
create or replace function add_variant_asin_if_room(p_variant_id uuid, p_asin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next smallint;
begin
  if p_asin is null or p_asin !~ '^[A-Z0-9]{10}$' then
    return;
  end if;
  if exists (select 1 from variant_asins where variant_id = p_variant_id and asin = p_asin) then
    return;
  end if;
  select min(p) into v_next
  from generate_series(1, 3) as p
  where not exists (select 1 from variant_asins where variant_id = p_variant_id and position = p);
  if v_next is not null then
    insert into variant_asins (variant_id, asin, position)
    values (p_variant_id, p_asin, v_next)
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function add_variant_asin_if_room(uuid, text) from public;

-- ─────────────────────────────────────────────────────────────
-- 2. Data entry adds or removes an ASIN.
-- ─────────────────────────────────────────────────────────────
create or replace function sync_model_asin_to_variants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if tg_op = 'INSERT' then
    if new.color is not null then
      for r in
        select id from model_variants
        where model_id = new.model_id and lower(color) = lower(new.color)
      loop
        perform add_variant_asin_if_room(r.id, new.asin);
      end loop;
    end if;
    return new;
  end if;

  -- DELETE: take it off that model + colour's inventory line.
  if old.color is not null then
    delete from variant_asins va
    using model_variants v
    where va.variant_id = v.id
      and v.model_id = old.model_id
      and lower(v.color) = lower(old.color)
      and va.asin = old.asin;
  end if;
  return old;
end;
$$;

drop trigger if exists model_asins_sync_variants on model_asins;
create trigger model_asins_sync_variants
  after insert or delete on model_asins
  for each row execute procedure sync_model_asin_to_variants();

-- ─────────────────────────────────────────────────────────────
-- 3. A new model + colour picks up the ASINs data entry has for it.
-- ─────────────────────────────────────────────────────────────
create or replace function sync_new_variant_asins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select asin from model_asins
    where model_id = new.model_id and lower(color) = lower(new.color)
    order by created_at
  loop
    perform add_variant_asin_if_room(new.id, r.asin);
  end loop;
  return new;
end;
$$;

drop trigger if exists model_variants_pick_up_asins on model_variants;
create trigger model_variants_pick_up_asins
  after insert on model_variants
  for each row execute procedure sync_new_variant_asins();

-- ─────────────────────────────────────────────────────────────
-- 4. Backfill: copy every ASIN data entry already added.
-- ─────────────────────────────────────────────────────────────
do $$
declare
  r record;
begin
  for r in
    select v.id as variant_id, a.asin
    from model_asins a
    join model_variants v on v.model_id = a.model_id and lower(v.color) = lower(a.color)
    where a.color is not null
    order by v.id, a.created_at
  loop
    perform add_variant_asin_if_room(r.variant_id, r.asin);
  end loop;
end;
$$;
