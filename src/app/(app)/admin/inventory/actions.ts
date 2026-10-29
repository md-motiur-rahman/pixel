"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { revalidatePath } from "next/cache";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateAsins } from "@/lib/asin";
import { verifyPassword } from "@/lib/verify-password";
import { isInventoryGrade } from "@/lib/grades";

// One row per model + colour. Its three (or more) grades sit side by side as
// quantities, so the same model and colour is never split over several lines.
export type InventoryRow = {
  variantId: string;
  brand: string;
  model: string;
  color: string;
  /** Stock per grade code, e.g. { A: 4, B: 0, C: 2 }. */
  quantities: Record<string, number>;
  /** Main ASIN first, then up to 2 extra. Empty until an admin adds one. */
  asins: string[];
};

export type InventoryData = {
  rows: InventoryRow[];
  /** Grade codes in display order — one column each, even if nothing is in stock yet. */
  grades: string[];
};

export async function listInventory(): Promise<InventoryData> {
  const admin = await requireAdmin();
  if (!admin.ok) return { rows: [], grades: [] };

  const [gradesResult, result] = await Promise.all([
    admin.supabase.from("grades").select("code").order("sort_order").order("code"),
    // Every model + colour — including ones data entry added that have no stock yet.
    fetchAllPages(async (from, to) =>
      admin.supabase
        .from("model_variants")
        .select(
          "id, color, models ( name, brands ( name ) ), sku_lines ( quantity, grades ( code ) ), variant_asins ( asin, position )"
        )
        .order("id")
        .range(from, to)
    ),
  ]);
  if (!result.ok) return { rows: [], grades: [] };

  // Repair and Clearance grades aren't inventory — they have their own pages. A
  // model + colour that only has those grades doesn't get a row here at all; one
  // with no stock lines yet (just added by data entry) shows with zeros.
  const inventoryVariants = result.rows.filter((variant) => {
    const lines = (variant.sku_lines ?? []) as unknown as { grades: { code: string } }[];
    return lines.length === 0 || lines.some((line) => isInventoryGrade(line.grades.code));
  });

  const rows: InventoryRow[] = inventoryVariants.map((variant) => {
    const model = variant.models as unknown as { name: string; brands: { name: string } };
    const lines = ((variant.sku_lines ?? []) as unknown as { quantity: number; grades: { code: string } }[]).filter(
      (line) => isInventoryGrade(line.grades.code)
    );
    const asins = (variant.variant_asins ?? []) as unknown as { asin: string; position: number }[];

    const quantities: Record<string, number> = {};
    for (const line of lines) quantities[line.grades.code] = (quantities[line.grades.code] ?? 0) + line.quantity;

    return {
      variantId: variant.id,
      brand: model.brands.name,
      model: model.name,
      color: variant.color,
      quantities,
      asins: asins
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((a) => a.asin),
    };
  });

  rows.sort((a, b) =>
    `${a.brand}\u0000${a.model}\u0000${a.color}`.localeCompare(`${b.brand}\u0000${b.model}\u0000${b.color}`)
  );

  const grades = (gradesResult.data ?? []).map((g) => g.code).filter(isInventoryGrade);
  // Safety net: a grade that has stock but somehow isn't in the grades list still gets a column.
  for (const row of rows) for (const code of Object.keys(row.quantities)) if (!grades.includes(code)) grades.push(code);

  return { rows, grades };
}

export async function saveAsins(
  variantId: string,
  asins: string[]
): Promise<{ ok: true; asins: string[] } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };

  const checked = validateAsins(asins);
  if (!checked.ok) return { ok: false, error: checked.error };

  const { error } = await admin.supabase.rpc("set_variant_asins", {
    p_variant_id: variantId,
    p_asins: checked.asins,
  });
  if (error) {
    // PGRST202: PostgREST can't find the function — the migration hasn't been run.
    if (error.code === "PGRST202") {
      return {
        ok: false,
        error: "ASINs need a database update — run supabase/migration_6_asins_per_model_colour.sql in Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/inventory");
  return { ok: true, asins: checked.asins };
}

// Re-checks the signed-in admin's own password on the server. The bulk tools below
// call database functions that only the service role may run, so this check can't
// be skipped from the browser.
async function confirmAdminPassword(
  admin: Extract<Awaited<ReturnType<typeof requireAdmin>>, { ok: true }>,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: profile } = await admin.supabase.from("profiles").select("email").eq("id", admin.userId).single();
  const valid = profile?.email ? await verifyPassword(profile.email, password) : false;
  if (!valid) {
    // A short pause on a wrong password makes guessing impractical.
    await new Promise((resolve) => setTimeout(resolve, 800));
    return { ok: false, error: "That password isn't correct." };
  }
  return { ok: true };
}

// Permanently deletes every in-stock item record (password required).
export async function emptyInventory(
  password: string
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };

  const confirmed = await confirmAdminPassword(admin, password);
  if (!confirmed.ok) return confirmed;

  const { data, error } = await createAdminClient().rpc("empty_inventory", { p_admin_id: admin.userId });
  if (error) {
    if (error.code === "PGRST202") {
      return {
        ok: false,
        error: "Emptying isn't set up yet — run supabase/migration_5_asins_and_empty_inventory.sql in Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/inventory");
  return { ok: true, deleted: data };
}

// Sets every model's stock to 0 without deleting any item record (password required).
export async function zeroInventory(
  password: string
): Promise<{ ok: true; lines: number } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };

  const confirmed = await confirmAdminPassword(admin, password);
  if (!confirmed.ok) return confirmed;

  const { data, error } = await createAdminClient().rpc("zero_inventory", { p_admin_id: admin.userId });
  if (error) {
    if (error.code === "PGRST202") {
      return {
        ok: false,
        error: "Zeroing stock needs a database update — run supabase/migration_8_optional_serial_and_zero_stock.sql in Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/inventory");
  return { ok: true, lines: data };
}

export type DeleteEntryResult =
  | { ok: true; cameras: number; modelRemoved: boolean; brandRemoved: boolean }
  | { ok: false; error: string };

// Deletes one model + colour added by mistake, with its in-stock items (password
// required). The database refuses if any of its items were picked or shipped.
export async function deleteInventoryEntry(variantId: string, password: string): Promise<DeleteEntryResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };

  const confirmed = await confirmAdminPassword(admin, password);
  if (!confirmed.ok) return confirmed;

  const { data, error } = await createAdminClient().rpc("delete_inventory_entry", {
    p_admin_id: admin.userId,
    p_variant_id: variantId,
  });
  if (error) {
    if (error.code === "PGRST202") {
      return {
        ok: false,
        error: "Deleting entries needs a database update — run supabase/migration_11_delete_inventory_entry.sql in Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }

  const result = data as { cameras: number; model_removed: boolean; brand_removed: boolean };
  revalidatePath("/admin/inventory");
  return {
    ok: true,
    cameras: result.cameras,
    modelRemoved: result.model_removed,
    brandRemoved: result.brand_removed,
  };
}
