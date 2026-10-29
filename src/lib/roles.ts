import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/types/database";

// Canonical order: admin first, so the primary role (first in the list) is the
// admin one for anyone who has it.
export const ALL_ROLES: Role[] = [
  "admin",
  "tester",
  "dispatcher",
  "checker",
  "data_entry",
  "master_stocker",
  "repair",
  "clearance",
];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  tester: "Tester",
  dispatcher: "Dispatcher",
  checker: "Checker",
  data_entry: "Data entry",
  master_stocker: "Master stocker",
  repair: "Repair",
  clearance: "Clearance",
};

// Where each role lands, and the URL section it owns.
export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin/dashboard",
  tester: "/tester",
  dispatcher: "/dispatcher",
  checker: "/checker",
  data_entry: "/data-entry",
  master_stocker: "/master-stock",
  repair: "/repair",
  clearance: "/clearance",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ALL_ROLES as string[]).includes(value);
}

/** Valid roles only, no duplicates, in canonical order. */
export function sortRoles(roles: Iterable<Role>): Role[] {
  const set = new Set(roles);
  return ALL_ROLES.filter((role) => set.has(role));
}

/** The person's own list of roles, or — for a row not migrated yet — just their one `role`. */
export function normalizeRoles(roles: unknown, role: unknown): Role[] {
  const list = Array.isArray(roles) ? roles.filter(isRole) : [];
  if (list.length > 0) return sortRoles(list);
  return isRole(role) ? [role] : [];
}

/** Admins can use every section; everyone else only the roles they hold. */
export function hasRole(roles: Role[], role: Role): boolean {
  return roles.includes("admin") || roles.includes(role);
}

/** Where to send someone by default: admin's home if they're an admin, else their first role's. */
export function homeFor(roles: Role[]): string | null {
  const primary = roles[0];
  return primary ? ROLE_HOME[primary] : null;
}

// Reads a profile's roles. If supabase/migration_9_multi_role_master_stock.sql
// hasn't been run yet there is no `roles` column — fall back to the old single
// `role` so signing in keeps working until it is.
export async function fetchProfileRoles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string
): Promise<{ roles: Role[]; isActive: boolean; fullName: string } | null> {
  const withRoles = await supabase
    .from("profiles")
    .select("role, roles, is_active, full_name")
    .eq("id", userId)
    .single();
  if (!withRoles.error && withRoles.data) {
    const row = withRoles.data;
    return { roles: normalizeRoles(row.roles, row.role), isActive: row.is_active, fullName: row.full_name };
  }

  const legacy = await supabase.from("profiles").select("role, is_active, full_name").eq("id", userId).single();
  if (legacy.error || !legacy.data) return null;
  const row = legacy.data;
  return { roles: normalizeRoles(null, row.role), isActive: row.is_active, fullName: row.full_name };
}
