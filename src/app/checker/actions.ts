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
  // Aggregated in SQL (see get_stock_count_tally) rather than fetching every
  // raw scan row and grouping in JS — that would re-transfer the whole
  // session's growing scan history after every single scan (O(n^2) total for
  // n scans). This returns one row per SKU line instead, bounded by catalog
  // size regardless of how many scans have happened.
  const tallyResult = await fetchAllPages(async (from, to) =>
    supabase.rpc("get_stock_count_tally", { p_stock_count_id: stockCountId }).range(from, to)
  );
  if (!tallyResult.ok) return tallyResult;

  const rows: TallyRow[] = tallyResult.rows.map((row) => ({
    skuLineId: row.sku_line_id,
    brand: row.brand,
    model: row.model,
    color: row.color,
    grade: row.grade,
    systemQty: row.system_qty,
    scannedQty: row.scanned_qty,
    diff: row.scanned_qty - row.system_qty,
  }));

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
): Promise<
  // permanent: retrying this exact request could never succeed, as opposed
  // to a transient upsert error, which a queued offline retry should hold
  // onto rather than drop.
  { ok: true; alreadyScanned: boolean } | { ok: false; error: string; permanent?: boolean }
> {
  const unitId = rawScan.trim();
  if (!unitId) return { ok: false, error: "Empty scan.", permanent: true };
  const supabase = await createClient();

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("id")
    .eq("id", unitId)
    .maybeSingle();
  if (unitError) return { ok: false, error: unitError.message };
  if (!unit) return { ok: false, error: "No camera found for that QR code.", permanent: true };

  // Enforced server-side, not just by disabling the UI while finishing —
  // a scan already in flight (or replayed from the offline queue) could
  // otherwise land after the session was closed.
  const { data: session, error: sessionError } = await supabase
    .from("stock_counts")
    .select("finished_at")
    .eq("id", stockCountId)
    .maybeSingle();
  if (sessionError) return { ok: false, error: sessionError.message };
  if (!session) return { ok: false, error: "This count session no longer exists.", permanent: true };
  if (session.finished_at) {
    return { ok: false, error: "This count session has already been finished.", permanent: true };
  }

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
