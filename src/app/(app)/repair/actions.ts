"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { fetchProfileRoles, hasRole } from "@/lib/roles";

export type FinishRepairResult = { ok: true; grade: string; inInventory: boolean } | { ok: false; error: string };

// Repair done: the item takes the grade the repair person gives it. An inventory
// grade (A, B, C …) puts it back in stock and on the Amazon queue; Clearance
// moves it to Clearance. The database logs the grade change.
export async function finishRepair(unitId: string, gradeId: string): Promise<FinishRepairResult> {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { ok: false, error: "Not signed in." };
  const profile = await fetchProfileRoles(supabase, user.id);
  if (!profile || !hasRole(profile.roles, "repair")) return { ok: false, error: "Only repair staff can do that." };
  if (!gradeId) return { ok: false, error: "Pick the grade the item is now." };

  const { data, error } = await supabase.rpc("finish_repair", { p_unit_id: unitId, p_grade_id: gradeId });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      return {
        ok: false,
        error: "Finishing repairs needs a database update — run supabase/migration_17_amazon_listing_and_grade_log.sql in Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }

  const result = data as { grade: string; in_inventory: boolean };
  revalidatePath("/repair");
  revalidatePath("/clearance");
  revalidatePath("/amazon");
  revalidatePath("/admin/inventory");
  return { ok: true, grade: result.grade, inInventory: result.in_inventory };
}
