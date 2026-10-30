-- Amazon listing, grade history, and finishing repairs.
-- Run once in the Supabase SQL editor, AFTER migration_16_data_entry_asins_to_inventory.sql.
-- Safe to run more than once.
--
--   • New role "amazon" (Amazon lister) — master stockers can list too. Every item a tester saves in an
--     inventory grade (A, B, C …) joins the Amazon queue. The lister checks it,
--     regrades it if needed, and marks it listed. The item records who checked it.
--   • Every grade change is logged (A → B, who, when, why).
--   • Repair staff finish a repair by grading the item: it moves into the
--     inventory (its quantity counts again) and joins the Amazon queue.
-- Items already in stock before this runs are not queued.

-- ─────────────────────────────────────────────────────────────
-- 1. The new role.
-- ─────────────────────────────────────────────────────────────
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table profiles
  add constraint profiles_role_check
  check (role in ('admin', 'tester', 'dispatcher', 'checker', 'data_entry', 'master_stocker', 'repair', 'clearance', 'amazon'));

alter table profiles
  add constraint profiles_roles_check
  check (
    cardinality(roles) >= 1
    and roles <@ array['admin', 'tester', 'dispatcher', 'checker', 'data_entry', 'master_stocker', 'repair', 'clearance', 'amazon']
  );

-- ─────────────────────────────────────────────────────────────
-- 2. Who checked an item (the Amazon lister).
-- ─────────────────────────────────────────────────────────────
alter table units add column if not exists checked_by uuid references profiles (id);
alter table units add column if not exists checked_at timestamptz;

-- ─────────────────────────────────────────────────────────────
-- 3. Grade history. Grade codes are stored as text so the history still reads
--    right if a grade is ever renamed.
-- ─────────────────────────────────────────────────────────────
create table if not exists grade_changes (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units (id) on delete cascade,
  from_grade text not null,
  to_grade text not null,
  changed_by uuid references profiles (id),
  changed_at timestamptz not null default now(),
  -- amazon_check = regraded by the Amazon lister, repair = repair finished,
  -- edit = changed in Tester → Find a saved item (or anything else).
  reason text not null default 'edit' check (reason in ('edit', 'amazon_check', 'repair'))
);

create index if not exists grade_changes_unit_idx on grade_changes (unit_id, changed_at);
create index if not exists grade_changes_changed_at_idx on grade_changes (changed_at);

alter table grade_changes enable row level security;
drop policy if exists grade_changes_read on grade_changes;
create policy grade_changes_read on grade_changes for select using (auth.role() = 'authenticated');
-- No write policies: rows are only written by the trigger below.

-- ─────────────────────────────────────────────────────────────
-- 4. The Amazon queue: one row per item to list (or already listed).
-- ─────────────────────────────────────────────────────────────
create table if not exists amazon_queue (
  unit_id uuid primary key references units (id) on delete cascade,
  added_at timestamptz not null default now(),
  source text not null default 'tested' check (source in ('tested', 'repaired')),
  listed_at timestamptz,
  listed_by uuid references profiles (id)
);

create index if not exists amazon_queue_waiting_idx on amazon_queue (added_at) where listed_at is null;
create index if not exists amazon_queue_listed_idx on amazon_queue (listed_at) where listed_at is not null;

alter table amazon_queue enable row level security;
drop policy if exists amazon_queue_read on amazon_queue;
create policy amazon_queue_read on amazon_queue for select using (has_any_role(array['amazon', 'master_stocker']));
-- No write policies: rows are only written by the triggers and functions below.

-- ─────────────────────────────────────────────────────────────
-- 5. Triggers on units.
--    New item in an inventory grade → queued for Amazon.
--    Grade changed → logged; moved out of the inventory grades (to Repair or
--    Clearance) → leaves the queue if not listed yet; moved back into them
--    (repaired) → queued again.
-- ─────────────────────────────────────────────────────────────
create or replace function grade_of_line(p_sku_line_id uuid)
returns table (code text, in_inventory boolean)
language sql
stable
security definer
set search_path = public
as $$
  select g.code, g.in_inventory from sku_lines sl join grades g on g.id = sl.grade_id where sl.id = p_sku_line_id;
$$;

create or replace function units_amazon_and_grade_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
  v_new record;
  v_reason text := coalesce(nullif(current_setting('pixel.grade_reason', true), ''), 'edit');
begin
  select * into v_new from grade_of_line(new.sku_line_id);

  if tg_op = 'INSERT' then
    if v_new.in_inventory and new.status = 'in_stock' then
      insert into amazon_queue (unit_id, source) values (new.id, 'tested') on conflict (unit_id) do nothing;
    end if;
    return new;
  end if;

  -- UPDATE of sku_line_id
  if old.sku_line_id is not distinct from new.sku_line_id then
    return new;
  end if;
  select * into v_old from grade_of_line(old.sku_line_id);

  if v_old.code is distinct from v_new.code then
    insert into grade_changes (unit_id, from_grade, to_grade, changed_by, reason)
    values (new.id, v_old.code, v_new.code, auth.uid(), v_reason);
  end if;

  if not v_new.in_inventory then
    delete from amazon_queue where unit_id = new.id and listed_at is null;
  elsif not v_old.in_inventory and new.status = 'in_stock' then
    insert into amazon_queue (unit_id, source) values (new.id, 'repaired')
    on conflict (unit_id) do update
      set added_at = now(), source = 'repaired', listed_at = null, listed_by = null;
  end if;

  return new;
end;
$$;

drop trigger if exists units_amazon_queue_insert on units;
create trigger units_amazon_queue_insert
  after insert on units
  for each row execute procedure units_amazon_and_grade_log();

drop trigger if exists units_amazon_queue_regrade on units;
create trigger units_amazon_queue_regrade
  after update of sku_line_id on units
  for each row execute procedure units_amazon_and_grade_log();

-- ─────────────────────────────────────────────────────────────
-- 6. Move one item to another grade of the same model + colour (creating that
--    grade's stock line if needed). Quantities follow automatically.
-- ─────────────────────────────────────────────────────────────
create or replace function move_unit_to_grade(p_unit_id uuid, p_grade_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_variant uuid;
  v_line uuid;
begin
  select sl.model_variant_id into v_variant
  from units u join sku_lines sl on sl.id = u.sku_line_id
  where u.id = p_unit_id;
  if v_variant is null then
    raise exception 'That item no longer exists';
  end if;
  if not exists (select 1 from grades where id = p_grade_id) then
    raise exception 'That grade no longer exists';
  end if;

  select id into v_line from sku_lines where model_variant_id = v_variant and grade_id = p_grade_id;
  if v_line is null then
    insert into sku_lines (code, model_variant_id, grade_id)
    values (next_sku_code(), v_variant, p_grade_id)
    on conflict (model_variant_id, grade_id) do nothing
    returning id into v_line;
    if v_line is null then
      select id into v_line from sku_lines where model_variant_id = v_variant and grade_id = p_grade_id;
    end if;
  end if;

  perform set_config('pixel.grade_reason', p_reason, true);
  update units set sku_line_id = v_line where id = p_unit_id and sku_line_id is distinct from v_line;
  perform set_config('pixel.grade_reason', '', true);
end;
$$;

revoke all on function move_unit_to_grade(uuid, uuid, text) from public;

-- ─────────────────────────────────────────────────────────────
-- 7. The Amazon lister checks an item: optionally regrades it, records them as
--    the checker, and marks it listed. Regraded to Repair/Clearance → it leaves
--    the queue instead of being listed.
-- ─────────────────────────────────────────────────────────────
create or replace function amazon_check_unit(p_unit_id uuid, p_grade_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue amazon_queue%rowtype;
  v_status text;
  v_old_grade uuid;
  v_new record;
begin
  if not has_any_role(array['amazon', 'master_stocker']) then
    raise exception 'Only an Amazon lister, master stocker or admin can do that';
  end if;

  select * into v_queue from amazon_queue where unit_id = p_unit_id for update;
  if v_queue.unit_id is null then
    raise exception 'That item is not waiting to be listed on Amazon';
  end if;
  if v_queue.listed_at is not null then
    raise exception 'That item has already been listed';
  end if;

  select u.status, sl.grade_id into v_status, v_old_grade
  from units u join sku_lines sl on sl.id = u.sku_line_id
  where u.id = p_unit_id;

  if p_grade_id is not null and p_grade_id <> v_old_grade then
    if v_status <> 'in_stock' then
      raise exception 'This item has already been picked, so its grade can''t be changed here';
    end if;
    perform move_unit_to_grade(p_unit_id, p_grade_id, 'amazon_check');
  end if;

  update units set checked_by = auth.uid(), checked_at = now() where id = p_unit_id;

  select g.code, g.in_inventory into v_new
  from units u join sku_lines sl on sl.id = u.sku_line_id join grades g on g.id = sl.grade_id
  where u.id = p_unit_id;

  if v_new.in_inventory then
    update amazon_queue set listed_at = now(), listed_by = auth.uid() where unit_id = p_unit_id;
  end if;
  -- Not an inventory grade: the trigger already took it off the queue.

  return jsonb_build_object(
    'regraded', p_grade_id is not null and p_grade_id <> v_old_grade,
    'grade', v_new.code,
    'listed', v_new.in_inventory
  );
end;
$$;

revoke all on function amazon_check_unit(uuid, uuid) from public;
grant execute on function amazon_check_unit(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 8. Repair finished: the repair person grades the item. An inventory grade
--    puts it back in the inventory and on the Amazon queue (via the trigger);
--    Clearance moves it to Clearance.
-- ─────────────────────────────────────────────────────────────
create or replace function finish_repair(p_unit_id uuid, p_grade_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_code text;
  v_new record;
begin
  if not has_any_role(array['repair']) then
    raise exception 'Only repair staff or an admin can do that';
  end if;

  select u.status, g.code into v_status, v_code
  from units u join sku_lines sl on sl.id = u.sku_line_id join grades g on g.id = sl.grade_id
  where u.id = p_unit_id
  for update of u;
  if v_status is null then
    raise exception 'That item no longer exists';
  end if;
  if v_status <> 'in_stock' or v_code <> 'D' then
    raise exception 'That item is no longer waiting for repair';
  end if;

  select code, in_inventory into v_new from grades where id = p_grade_id;
  if v_new.code is null then
    raise exception 'That grade no longer exists';
  end if;
  if v_new.code = 'D' then
    raise exception 'Pick the grade the item is now';
  end if;

  perform move_unit_to_grade(p_unit_id, p_grade_id, 'repair');

  return jsonb_build_object('grade', v_new.code, 'in_inventory', v_new.in_inventory);
end;
$$;

revoke all on function finish_repair(uuid, uuid) from public;
grant execute on function finish_repair(uuid, uuid) to authenticated;
