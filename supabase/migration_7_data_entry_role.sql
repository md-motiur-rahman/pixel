-- "Data entry" staff role: adds camera brands, models and their ASINs so testers
-- can pick them from dropdowns. Run once in the Supabase SQL editor, AFTER
-- migration_6_asins_per_model_colour.sql.

-- ─────────────────────────────────────────────────────────────
-- 1. Allow the new role on profiles. The original check constraint was created
--    inline (so its name is generated); find it by what it checks.
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
  check (role in ('admin', 'tester', 'dispatcher', 'checker', 'data_entry'));

-- ─────────────────────────────────────────────────────────────
-- 2. Data entry can create brands and models (like a tester can); editing and
--    deleting stay admin-only.
-- ─────────────────────────────────────────────────────────────
drop policy if exists catalog_write_brands on brands;
create policy catalog_write_brands on brands for insert
  with check (app_role() in ('admin', 'tester', 'data_entry'));

drop policy if exists catalog_write_models on models;
create policy catalog_write_models on models for insert
  with check (app_role() in ('admin', 'tester', 'data_entry'));

-- ─────────────────────────────────────────────────────────────
-- 3. ASINs entered per MODEL by data entry. A tester picks one of them from a
--    dropdown when logging a camera; it then becomes an ASIN of that camera's
--    model + colour (variant_asins), which admins manage on the inventory page.
--    A model can have several (e.g. Amazon lists one per colour).
-- ─────────────────────────────────────────────────────────────
create table if not exists model_asins (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models (id) on delete cascade,
  asin text not null check (asin ~ '^[A-Z0-9]{10}$'),
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (model_id, asin)
);

create index if not exists model_asins_model_idx on model_asins (model_id);

alter table model_asins enable row level security;

drop policy if exists model_asins_read on model_asins;
create policy model_asins_read on model_asins for select using (auth.role() = 'authenticated');

drop policy if exists model_asins_insert on model_asins;
create policy model_asins_insert on model_asins for insert
  with check (app_role() in ('admin', 'data_entry'));

drop policy if exists model_asins_delete on model_asins;
create policy model_asins_delete on model_asins for delete
  using (app_role() in ('admin', 'data_entry'));

-- ─────────────────────────────────────────────────────────────
-- 4. Used when a tester saves a camera: give the camera's model + colour the ASIN
--    they picked — only if it really is one of that model's ASINs, and only while
--    the model + colour has room (3 max). Never replaces what an admin set.
-- ─────────────────────────────────────────────────────────────
create or replace function attach_model_asin_to_variant(p_variant_id uuid, p_asin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_model_id uuid;
  v_asin text := upper(btrim(coalesce(p_asin, '')));
  v_next smallint;
begin
  if app_role() not in ('admin', 'tester') then
    raise exception 'Only a tester or admin can do that';
  end if;

  select model_id into v_model_id from model_variants where id = p_variant_id;
  if v_model_id is null then
    raise exception 'That model and colour no longer exists';
  end if;

  if not exists (select 1 from model_asins where model_id = v_model_id and asin = v_asin) then
    raise exception 'ASIN % is not one of this model''s ASINs', v_asin;
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
-- 5. Merging two models keeps the source model's ASINs too.
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

  insert into model_asins (model_id, asin, created_by)
  select target_id, asin, created_by from model_asins where model_id = source_id
  on conflict (model_id, asin) do nothing;

  update model_variants set model_id = target_id where model_id = source_id;
  delete from models where id = source_id;  -- leftover source model ASINs go with it (on delete cascade)
end;
$$;
