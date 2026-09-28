"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { fetchAllPages } from "@/lib/fetch-all-pages";

export type InventoryRow = {
  skuLineId: string;
  brand: string;
  model: string;
  color: string;
  grade: string;
  quantity: number;
};

export async function listInventory(): Promise<InventoryRow[]> {
  const admin = await requireAdmin();
  if (!admin.ok) return [];

  const result = await fetchAllPages(async (from, to) =>
    admin.supabase
      .from("sku_lines")
      .select("id, quantity, grades ( code ), model_variants ( color, models ( name, brands ( name ) ) )")
      .order("id")
      .range(from, to)
  );
  if (!result.ok) return [];

  const rows: InventoryRow[] = result.rows.map((sl) => {
    const variant = sl.model_variants as unknown as {
      color: string;
      models: { name: string; brands: { name: string } };
    };
    const grade = sl.grades as unknown as { code: string };
    return {
      skuLineId: sl.id,
      brand: variant.models.brands.name,
      model: variant.models.name,
      color: variant.color,
      grade: grade.code,
      quantity: sl.quantity,
    };
  });

  rows.sort((a, b) =>
    `${a.brand}${a.model}${a.color}${a.grade}`.localeCompare(`${b.brand}${b.model}${b.color}${b.grade}`)
  );

  return rows;
}
