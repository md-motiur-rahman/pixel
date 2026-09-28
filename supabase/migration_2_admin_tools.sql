-- Run this ONLY if you already ran the original supabase/schema.sql against a
-- live project before this update. If you're setting up a fresh project, just
-- run the current supabase/schema.sql — it already includes all of this.
--
-- Safe to run more than once.

-- profiles: email + is_active (needed for resend/deactivate staff)
-- coalesce to '' because a profile can exist for a phone-only auth user with
-- no email at all, which would otherwise leave email null and make the
-- following "set not null" fail.
alter table profiles add column if not exists email text;
update profiles p set email = coalesce(u.email, '') from auth.users u where u.id = p.id and p.email is null;
alter table profiles alter column email set not null;
alter table profiles add column if not exists is_active boolean not null default true;

-- Staff created going forward carry email + role from their invite metadata.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'role', 'tester')
  );
  return new;
end;
$$;

-- Quantity trigger now also handles a unit moving to a different sku_line
-- (the "fix a saved camera's grade" flow), which needs both the old and new
-- sku_line's quantity recomputed.
create or replace function sync_sku_line_quantity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    update sku_lines
    set quantity = (select count(*) from units where sku_line_id = old.sku_line_id and status = 'in_stock')
    where id = old.sku_line_id;
    return old;
  end if;

  update sku_lines
  set quantity = (select count(*) from units where sku_line_id = new.sku_line_id and status = 'in_stock')
  where id = new.sku_line_id;

  if tg_op = 'UPDATE' and old.sku_line_id is distinct from new.sku_line_id then
    update sku_lines
    set quantity = (select count(*) from units where sku_line_id = old.sku_line_id and status = 'in_stock')
    where id = old.sku_line_id;
  end if;

  return new;
end;
$$;

drop trigger if exists units_sync_quantity on units;
create trigger units_sync_quantity
  after insert or update of status, sku_line_id or delete on units
  for each row execute procedure sync_sku_line_quantity();

-- Needed so the catalog-merge tools below can delete a sku_line once its
-- units have been reassigned to the surviving sku_line.
drop policy if exists sku_lines_admin_delete on sku_lines;
create policy sku_lines_admin_delete on sku_lines for delete using (app_role() = 'admin');

-- Catalog merge helpers (admin-only "fix a duplicate" tools).
create or replace function merge_sku_lines(source_id uuid, target_id uuid)
returns void
language plpgsql
as $$
begin
  if app_role() <> 'admin' then
    raise exception 'Only an admin can merge SKU lines';
  end if;
  update units set sku_line_id = target_id where sku_line_id = source_id;
  delete from sku_lines where id = source_id;
end;
$$;

create or replace function merge_variants(source_id uuid, target_id uuid)
returns void
language plpgsql
as $$
declare
  r record;
begin
  if app_role() <> 'admin' then
    raise exception 'Only an admin can merge colors';
  end if;
  if source_id = target_id then
    raise exception 'Cannot merge a color into itself';
  end if;

  for r in
    select sl.id as source_sku_id, existing.id as target_sku_id
    from sku_lines sl
    join sku_lines existing on existing.model_variant_id = target_id and existing.grade_id = sl.grade_id
    where sl.model_variant_id = source_id
  loop
    perform merge_sku_lines(r.source_sku_id, r.target_sku_id);
  end loop;

  update sku_lines set model_variant_id = target_id where model_variant_id = source_id;
  delete from model_variants where id = source_id;
end;
$$;

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

  update model_variants set model_id = target_id where model_id = source_id;
  delete from models where id = source_id;
end;
$$;

create or replace function merge_brands(source_id uuid, target_id uuid)
returns void
language plpgsql
as $$
declare
  r record;
begin
  if app_role() <> 'admin' then
    raise exception 'Only an admin can merge brands';
  end if;
  if source_id = target_id then
    raise exception 'Cannot merge a brand into itself';
  end if;

  for r in
    select m.id as source_model_id, existing.id as target_model_id
    from models m
    join models existing on existing.brand_id = target_id and lower(existing.name) = lower(m.name)
    where m.brand_id = source_id and existing.id <> m.id
  loop
    perform merge_models(r.source_model_id, r.target_model_id);
  end loop;

  update models set brand_id = target_id where brand_id = source_id;
  delete from brands where id = source_id;
end;
$$;

-- Aggregates scan counts in SQL rather than pulling every raw scan row to the
-- client and grouping in JS — that approach re-fetches the whole session's
-- scan history after every single scan, so a session of n scans transfers
-- O(n^2) scan rows in total. This returns one row per SKU line instead,
-- bounded by catalog size rather than scan count.
create or replace function get_stock_count_tally(p_stock_count_id uuid)
returns table (
  sku_line_id uuid,
  brand text,
  model text,
  color text,
  grade text,
  system_qty int,
  scanned_qty int
)
language sql
stable
as $$
  select
    sl.id as sku_line_id,
    b.name as brand,
    m.name as model,
    mv.color as color,
    g.code as grade,
    sl.quantity as system_qty,
    coalesce(scan_counts.scanned_qty, 0) as scanned_qty
  from sku_lines sl
  join model_variants mv on mv.id = sl.model_variant_id
  join models m on m.id = mv.model_id
  join brands b on b.id = m.brand_id
  join grades g on g.id = sl.grade_id
  left join (
    select u.sku_line_id, count(*)::int as scanned_qty
    from stock_count_scans scs
    join units u on u.id = scs.unit_id
    where scs.stock_count_id = p_stock_count_id
    group by u.sku_line_id
  ) scan_counts on scan_counts.sku_line_id = sl.id
  where sl.quantity > 0 or coalesce(scan_counts.scanned_qty, 0) > 0
  order by sl.id;
$$;
