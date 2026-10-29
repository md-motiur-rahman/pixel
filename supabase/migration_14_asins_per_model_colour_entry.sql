-- Data entry: every model + COLOUR has its own ASIN(s), not one list per model.
-- Run once in the Supabase SQL editor, AFTER migration_13_repair_clearance_roles.sql.
-- Safe to run more than once.
--
-- model_asins gains a `color`. ASINs entered before this have no colour; they keep
-- working for every colour of their model until data entry replaces them.
-- The tester's ASIN dropdown then lists only the ASINs for the chosen model AND
-- colour (plus any of those older, colour-less ones).

-- ─────────────────────────────────────────────────────────────
-- 1. Colour column; unique per model + colour + ASIN (case-insensitive colour,
--    an empty colour counting as "any colour").
-- ─────────────────────────────────────────────────────────────
alter table model_asins add column if not exists color text;

alter table model_asins drop constraint if exists model_asins_model_id_asin_key;

create unique index if not exists model_asins_model_color_asin_key
  on model_asins (model_id, lower(coalesce(color, '')), asin);

create index if not exists model_asins_model_color_idx on model_asins (model_id, lower(coalesce(color, '')));

-- ─────────────────────────────────────────────────────────────
-- 2. A tester's picked ASIN must belong to that model AND colour (or be an older,
--    colour-less one for the model).
-- ─────────────────────────────────────────────────────────────
create or replace function attach_model_asin_to_variant(p_variant_id uuid, p_asin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_model_id uuid;
  v_color text;
  v_asin text := upper(btrim(coalesce(p_asin, '')));
  v_next smallint;
begin
  if not has_any_role(array['tester']) then
    raise exception 'Only a tester or admin can do that';
  end if;

  select model_id, color into v_model_id, v_color from model_variants where id = p_variant_id;
  if v_model_id is null then
    raise exception 'That model and colour no longer exists';
  end if;

  if not exists (
    select 1 from model_asins
    where model_id = v_model_id
      and asin = v_asin
      and (color is null or lower(color) = lower(v_color))
  ) then
    raise exception 'ASIN % is not one of this model and colour''s ASINs', v_asin;
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

revoke all on function attach_model_asin_to_variant(uuid, text) from public;
grant execute on function attach_model_asin_to_variant(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. Renaming a colour (Catalog) carries its data-entry ASINs to the new name.
-- ─────────────────────────────────────────────────────────────
create or replace function rename_model_asin_color()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.color is distinct from old.color or new.model_id is distinct from old.model_id then
    -- Drop any that would duplicate an ASIN the new model + colour already has.
    delete from model_asins a
    where a.model_id = old.model_id
      and lower(a.color) = lower(old.color)
      and exists (
        select 1 from model_asins b
        where b.model_id = new.model_id and lower(coalesce(b.color, '')) = lower(new.color) and b.asin = a.asin
      );
    update model_asins
    set model_id = new.model_id, color = new.color
    where model_id = old.model_id and lower(color) = lower(old.color);
  end if;
  return new;
end;
$$;

drop trigger if exists model_variants_rename_asin_color on model_variants;
create trigger model_variants_rename_asin_color
  after update of color, model_id on model_variants
  for each row execute procedure rename_model_asin_color();

-- ─────────────────────────────────────────────────────────────
-- 4. Merging two colours moves the source colour's data-entry ASINs to the target.
--    (Same as before, plus that one step.)
-- ─────────────────────────────────────────────────────────────
create or replace function merge_variants(source_id uuid, target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_next smallint;
  v_source model_variants%rowtype;
  v_target model_variants%rowtype;
begin
  if app_role() <> 'admin' then
    raise exception 'Only an admin can merge colors';
  end if;
  if source_id = target_id then
    raise exception 'Cannot merge a color into itself';
  end if;

  select * into v_source from model_variants where id = source_id;
  select * into v_target from model_variants where id = target_id;

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

  -- Data-entry ASINs of the source colour now belong to the target colour.
  if v_source.id is not null and v_target.id is not null then
    delete from model_asins a
    where a.model_id = v_source.model_id
      and lower(a.color) = lower(v_source.color)
      and exists (
        select 1 from model_asins b
        where b.model_id = v_target.model_id
          and lower(coalesce(b.color, '')) = lower(v_target.color)
          and b.asin = a.asin
      );
    update model_asins
    set model_id = v_target.model_id, color = v_target.color
    where model_id = v_source.model_id and lower(color) = lower(v_source.color);
  end if;

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

-- ─────────────────────────────────────────────────────────────
-- 5. Merging two models keeps the source model's ASINs (with their colours).
-- ─────────────────────────────────────────────────────────────
create or replace function merge_models(source_id uuid, target_id uuid)
returns void
language plpgsql
as $$
declare
  r record;
begin
  if app_role() <> 'admin' then
    raise exception 'Only an admin can merge models';
  end if;
  if source_id = target_id then
    raise exception 'Cannot merge a model into itself';
  end if;

  for r in
    select v.id as source_variant_id, existing.id as target_variant_id
    from model_variants v
    join model_variants existing on existing.model_id = target_id and lower(existing.color) = lower(v.color)
    where v.model_id = source_id and existing.id <> v.id
  loop
    perform merge_variants(r.source_variant_id, r.target_variant_id);
  end loop;

  insert into model_asins (model_id, color, asin, created_by)
  select target_id, color, asin, created_by from model_asins where model_id = source_id
  on conflict do nothing;

  update model_variants set model_id = target_id where model_id = source_id;
  delete from models where id = source_id;  -- leftover source model ASINs go with it (on delete cascade)
end;
$$;
