import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { fetchProfileRoles, hasRole, ROLE_LABEL } from "@/lib/roles";
import type { Role } from "@/types/database";

// One in-stock item of a non-inventory grade (Repair / Clearance).
export type GradeUnit = {
  id: string;
  brand: string;
  model: string;
  color: string;
  /** Null when the item has no serial number. */
  serialNumber: string | null;
  note: string | null;
  testerName: string | null;
  testedAt: string;
};

type RawUnit = {
  id: string;
  serial_number: string | null;
  note: string | null;
  tested_at: string;
  tester: unknown;
  sku_lines: unknown;
};

// Every in-stock item graded `gradeCode`, newest first — for someone holding
// `role` (admins can always see it).
export async function loadGradeUnits(
  gradeCode: string,
  role: Role
): Promise<{ ok: true; units: GradeUnit[] } | { ok: false; error: string }> {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { ok: false, error: "Not signed in." };
  const profile = await fetchProfileRoles(supabase, user.id);
  if (!profile || !hasRole(profile.roles, role)) {
    return { ok: false, error: `Only ${ROLE_LABEL[role].toLowerCase()} staff can see this page.` };
  }

  const result = await fetchAllPages<RawUnit>(async (from, to) =>
    supabase
      .from("units")
      .select(
        `id, serial_number, note, tested_at,
         tester:profiles!units_tester_id_fkey ( full_name ),
         sku_lines!inner ( grades!inner ( code ), model_variants ( color, models ( name, brands ( name ) ) ) )`
      )
      .eq("sku_lines.grades.code", gradeCode)
      .eq("status", "in_stock")
      .order("tested_at", { ascending: false })
      .order("id")
      .range(from, to)
  );
  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    units: result.rows.map((u) => {
      const line = u.sku_lines as {
        model_variants: { color: string; models: { name: string; brands: { name: string } } };
      };
      const tester = u.tester as { full_name: string } | null;
      return {
        id: u.id,
        brand: line.model_variants.models.brands.name,
        model: line.model_variants.models.name,
        color: line.model_variants.color,
        serialNumber: u.serial_number,
        note: u.note,
        testerName: tester?.full_name ?? null,
        testedAt: u.tested_at,
      };
    }),
  };
}
