"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { CLEARANCE_GRADE, REPAIR_GRADE, isInventoryGrade } from "@/lib/grades";

// Stock right now — not affected by the chosen period.
export type StockSnapshot = {
  /** Items in the inventory (grades A, B, C …), including ones on hold. */
  inventory: number;
  /** Per inventory grade, e.g. { A: 12, B: 4, C: 1 }. */
  byGrade: Record<string, number>;
  /** Picked, waiting for the master stocker to accept or refuse. */
  onHold: number;
  repair: number;
  clearance: number;
};

// One event in the period. The browser buckets them by its own local day, so
// "today" means today where the admin is.
export type TestedEvent = { at: string; by: string; grade: string };
export type SoldEvent = { at: string; by: string | null; price: number | null };
export type ListedEvent = { at: string; by: string | null };

// Amazon listing. Null until supabase/migration_17 has been run.
export type AmazonStats = {
  /** Waiting to be listed right now. */
  waiting: number;
  /** Listed in the period. */
  listed: ListedEvent[];
  /** Grade changed by the Amazon lister in the period. */
  regraded: number;
  /** Repairs finished in the period (graded out of Repair). */
  repaired: number;
};

export type DashboardData =
  | {
      ok: true;
      stock: StockSnapshot;
      tested: TestedEvent[];
      sold: SoldEvent[];
      amazon: AmazonStats | null;
      /** Staff id → name, for everyone who appears above. */
      names: Record<string, string>;
    }
  | { ok: false; error: string };

type GradeJoin = { code: string } | null;

export async function loadDashboard(fromIso: string, toIso: string): Promise<DashboardData> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.error };
  const { supabase } = admin;

  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    return { ok: false, error: "Pick a valid date range." };
  }

  const [lines, held, tested, sold, profiles, amazon] = await Promise.all([
    fetchAllPages(async (start, end) =>
      supabase.from("sku_lines").select("quantity, grades ( code )").order("id").range(start, end)
    ),
    supabase.from("master_stock").select("unit_id", { count: "exact", head: true }).is("accepted_at", null),
    fetchAllPages(async (start, end) =>
      supabase
        .from("units")
        .select("tested_at, tester_id, sku_lines ( grades ( code ) )")
        .gte("tested_at", from.toISOString())
        .lt("tested_at", to.toISOString())
        .order("tested_at")
        .range(start, end)
    ),
    fetchAllPages(async (start, end) =>
      supabase
        .from("master_stock")
        .select("accepted_at, accepted_by, selling_price")
        .not("accepted_at", "is", null)
        .gte("accepted_at", from.toISOString())
        .lt("accepted_at", to.toISOString())
        .order("accepted_at")
        .range(start, end)
    ),
    supabase.from("profiles").select("id, full_name, email"),
    loadAmazonStats(supabase, from, to),
  ]);

  if (!lines.ok) return { ok: false, error: lines.error };
  if (!tested.ok) return { ok: false, error: tested.error };
  if (!sold.ok) {
    // 42703: no accepted_at column yet — the master stock hold migration hasn't been run.
    return /accepted_at/.test(sold.error)
      ? { ok: false, error: "Sales need a database update — run supabase/migration_10_master_stock_hold.sql in Supabase." }
      : { ok: false, error: sold.error };
  }

  const stock: StockSnapshot = { inventory: 0, byGrade: {}, onHold: held.count ?? 0, repair: 0, clearance: 0 };
  for (const line of lines.rows as unknown as { quantity: number; grades: GradeJoin }[]) {
    const code = line.grades?.code ?? "";
    if (code === REPAIR_GRADE) stock.repair += line.quantity;
    else if (code === CLEARANCE_GRADE) stock.clearance += line.quantity;
    else if (isInventoryGrade(code)) {
      stock.inventory += line.quantity;
      stock.byGrade[code] = (stock.byGrade[code] ?? 0) + line.quantity;
    }
  }

  const testedEvents: TestedEvent[] = (
    tested.rows as unknown as { tested_at: string; tester_id: string; sku_lines: { grades: GradeJoin } | null }[]
  ).map((u) => ({ at: u.tested_at, by: u.tester_id, grade: u.sku_lines?.grades?.code ?? "?" }));

  const soldEvents: SoldEvent[] = (
    sold.rows as unknown as { accepted_at: string; accepted_by: string | null; selling_price: number | string | null }[]
  ).map((m) => ({
    at: m.accepted_at,
    by: m.accepted_by,
    price: m.selling_price === null ? null : Number(m.selling_price),
  }));

  const names: Record<string, string> = {};
  for (const p of (profiles.data ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
    names[p.id] = p.full_name?.trim() || p.email || "Unknown";
  }

  return { ok: true, stock, tested: testedEvents, sold: soldEvents, amazon, names };
}

// Missing tables (migration_17 not run yet) → null, so the rest still shows.
async function loadAmazonStats(
  supabase: Extract<Awaited<ReturnType<typeof requireAdmin>>, { ok: true }>["supabase"],
  from: Date,
  to: Date
): Promise<AmazonStats | null> {
  const [waiting, listed, changes] = await Promise.all([
    supabase.from("amazon_queue").select("unit_id", { count: "exact", head: true }).is("listed_at", null),
    fetchAllPages(async (start, end) =>
      supabase
        .from("amazon_queue")
        .select("listed_at, listed_by")
        .not("listed_at", "is", null)
        .gte("listed_at", from.toISOString())
        .lt("listed_at", to.toISOString())
        .order("listed_at")
        .range(start, end)
    ),
    fetchAllPages(async (start, end) =>
      supabase
        .from("grade_changes")
        .select("reason")
        .in("reason", ["amazon_check", "repair"])
        .gte("changed_at", from.toISOString())
        .lt("changed_at", to.toISOString())
        .order("changed_at")
        .range(start, end)
    ),
  ]);
  if (waiting.error || !listed.ok || !changes.ok) return null;

  return {
    waiting: waiting.count ?? 0,
    listed: (listed.rows as { listed_at: string; listed_by: string | null }[]).map((r) => ({ at: r.listed_at, by: r.listed_by })),
    regraded: (changes.rows as { reason: string }[]).filter((c) => c.reason === "amazon_check").length,
    repaired: (changes.rows as { reason: string }[]).filter((c) => c.reason === "repair").length,
  };
}
