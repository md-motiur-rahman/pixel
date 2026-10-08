import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";

const adjustmentSchema = z.object({
  skuLineId: z.string().uuid(),
  newQuantity: z.number().int().min(0).max(1_000_000),
  expectedQuantity: z.number().int().min(0),
  note: z.string().trim().max(200).optional(),
});

export type AdjustResult = { ok: true; quantity: number } | { ok: false; error: string };

// Every manual stock change goes through the adjust_sku_line_quantity() database
// function, which re-checks the caller's role, refuses if the stock moved since
// the person confirmed, and writes the audit row. See
// supabase/migration_3_stock_adjustments.sql.
export async function adjustStock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: z.input<typeof adjustmentSchema>,
  context: { source: "inventory" } | { source: "stock_count"; stockCountId: string }
): Promise<AdjustResult> {
  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That quantity isn't valid." };
  const { skuLineId, newQuantity, expectedQuantity, note } = parsed.data;

  const { data, error } = await supabase.rpc("adjust_sku_line_quantity", {
    p_sku_line_id: skuLineId,
    p_new_quantity: newQuantity,
    p_expected_quantity: expectedQuantity,
    p_source: context.source,
    p_stock_count_id: context.source === "stock_count" ? context.stockCountId : null,
    p_note: note ?? null,
  });

  if (error) {
    // PGRST202: PostgREST can't find the function — the migration hasn't been run.
    if (error.code === "PGRST202") {
      return {
        ok: false,
        error: "Stock adjustments aren't set up yet — run supabase/migration_3_stock_adjustments.sql in Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, quantity: data };
}
