-- Data entry: a brand + model + colour entered on the Data entry page becomes a real
-- catalogue entry (model_variants row), so it shows in Admin → Inventory with
-- zero stock and the tester gets it suggested.
-- Run once in the Supabase SQL editor, AFTER migration_14_asins_per_model_colour_entry.sql.
-- Safe to run more than once.

-- ─────────────────────────────────────────────────────────────
-- 1. Data entry staff may add model + colour entries (as testers already can).
-- ─────────────────────────────────────────────────────────────
drop policy if exists catalog_write_variants on model_variants;
create policy catalog_write_variants on model_variants for insert
  with check (has_any_role(array['tester', 'data_entry']));

-- ─────────────────────────────────────────────────────────────
-- 2. Backfill: every model + colour data entry already gave ASINs to gets its
--    entry, unless that model already has the colour (in any letter case).
-- ─────────────────────────────────────────────────────────────
insert into model_variants (model_id, color)
select distinct on (a.model_id, lower(a.color)) a.model_id, a.color
from model_asins a
where a.color is not null
  and btrim(a.color) <> ''
  and not exists (
    select 1 from model_variants v
    where v.model_id = a.model_id and lower(v.color) = lower(a.color)
  )
order by a.model_id, lower(a.color), a.created_at
on conflict do nothing;
