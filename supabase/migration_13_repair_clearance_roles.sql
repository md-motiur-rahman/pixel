-- Two more staff roles: "repair" (sees the Repair page — cameras graded D) and
-- "clearance" (sees the Clearance page — cameras graded E).
-- Run once in the Supabase SQL editor, AFTER migration_12_repair_clearance_grades.sql.
-- Safe to run more than once.
--
-- Both pages only read cameras (which every signed-in person can already read),
-- so the only database change is allowing the two role names.

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
  check (role in ('admin', 'tester', 'dispatcher', 'checker', 'data_entry', 'master_stocker', 'repair', 'clearance'));

alter table profiles
  add constraint profiles_roles_check
  check (
    cardinality(roles) >= 1
    and roles <@ array['admin', 'tester', 'dispatcher', 'checker', 'data_entry', 'master_stocker', 'repair', 'clearance']
  );
