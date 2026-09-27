"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/fetch-all-pages";

export type TallyRow = {
  skuLineId: string;
  brand: string;
  model: string;
  color: string;
  grade: string;
  systemQty: number;
  scannedQty: number;
  diff: number;
};

type ActionResult = { ok: true } | { ok: false; error: string };

async function computeTally(
  supabase: Awaited<ReturnType<typeof createClient>>,
  stockCountId: string
): Promise<{ ok: true; rows: TallyRow[] } | { ok: false; error: string }> {
  const skuLinesResult = await fetchAllPages(async (from, to) =>
    supabase
      .from("sku_lines")
      .select("id, quantity, grades ( code ), model_variants ( color, models ( name, brands ( name ) ) )")
      .order("id")
      .range(from, to)
  );
  if (!skuLinesResult.ok) return skuLinesResult;

  const scansResult = await fetchAllPages(async (from, to) =>
    supabase
      .from("stock_count_scans")
      .select("id, unit_id, units ( sku_line_id )")
      .eq("stock_count_id", stockCountId)
      .order("id")
      .range(from, to)
  );
  if (!scansResult.ok) return scansResult;

  const scannedCounts = new Map<string, number>();
  for (const scan of scansResult.rows) {
    const skuLineId = (scan.units as unknown as { sku_line_id: string } | null)?.sku_line_id;
    if (!skuLineId) continue;
    scannedCounts.set(skuLineId, (scannedCounts.get(skuLineId) ?? 0) + 1);
  }

  const rows: TallyRow[] = [];
  for (const sl of skuLinesResult.rows) {
    const scannedQty = scannedCounts.get(sl.id) ?? 0;
    if (sl.quantity === 0 && scannedQty === 0) continue;
    const variant = sl.model_variants as unknown as {
      color: string;
      models: { name: string; brands: { name: string } };
    };
    const grade = sl.grades as unknown as { code: string };
    rows.push({
      skuLineId: sl.id,
      brand: variant.models.brands.name,
      model: variant.models.name,
      color: variant.color,
      grade: grade.code,
      systemQty: sl.quantity,
      scannedQty,
      diff: scannedQty - sl.quantity,
    });
  }

  rows.sort((a, b) => {
    if (a.diff !== 0 && b.diff === 0) return -1;
    if (a.diff === 0 && b.diff !== 0) return 1;
    return `${a.brand}${a.model}${a.color}${a.grade}`.localeCompare(
      `${b.brand}${b.model}${b.color}${b.grade}`
    );
  });

  return { ok: true, rows };
}

// A page reload (or a crashed tab) loses the in-memory stockCountId even
// though the session is still open in the database — this lets the page
// resume the checker's own unfinished session instead of orphaning it.
export async function getActiveStockCount(): Promise<{ stockCountId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("stock_counts")
    .select("id")
    .eq("checker_id", user.id)
    .is("finished_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? { stockCountId: data.id } : null;
}

export async function startStockCount(): Promise<{ ok: true; stockCountId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase
    .from("stock_counts")
    .insert({ checker_id: user.id })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, stockCountId: data.id };
}

export async function recordScan(
  stockCountId: string,
  rawScan: string
): Promise<{ ok: true; alreadyScanned: boolean } | { ok: false; error: string }> {
  const unitId = rawScan.trim();
  if (!unitId) return { ok: false, error: "Empty scan." };
  const supabase = await createClient();

  const { data: unit } = await supabase.from("units").select("id").eq("id", unitId).maybeSingle();
  if (!unit) return { ok: false, error: "No camera found for that QR code." };

  const { data, error } = await supabase
    .from("stock_count_scans")
    .upsert(
      { stock_count_id: stockCountId, unit_id: unitId },
      { onConflict: "stock_count_id,unit_id", ignoreDuplicates: true }
    )
    .select("id");

  if (error) return { ok: false, error: error.message };
  const alreadyScanned = !data || data.length === 0;
  return { ok: true, alreadyScanned };
}

export async function getTally(
  stockCountId: string
): Promise<{ ok: true; tally: TallyRow[] } | { ok: false; error: string }> {
  const supabase = await createClient();
  const result = await computeTally(supabase, stockCountId);
  if (!result.ok) return result;
  return { ok: true, tally: result.rows };
}

export async function finishStockCount(stockCountId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("stock_counts")
    .update({ finished_at: new Date().toISOString() })
    .eq("id", stockCountId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
