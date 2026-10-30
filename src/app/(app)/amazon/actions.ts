"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { fetchProfileRoles, hasRole } from "@/lib/roles";

// One item for the Amazon lister: to list (waiting), or already listed.
export type AmazonItem = {
  unitId: string;
  brand: string;
  model: string;
  color: string;
  gradeId: string;
  grade: string;
  serialNumber: string | null;
  note: string | null;
  /** The model + colour's ASINs, main one first. */
  asins: string[];
  /** "repaired" when it came back from Repair rather than straight from testing. */
  source: "tested" | "repaired";
  addedAt: string;
  testedAt: string;
  testerName: string | null;
  /** False once a picker has picked it — its grade can't be changed then. */
  inStock: boolean;
  listedAt: string | null;
  listedByName: string | null;
  /** Oldest first: "A → B by Grace". */
  gradeHistory: { from: string; to: string; at: string; byName: string | null }[];
};

export type AmazonFilter = "waiting" | "listed";

export type AmazonList =
  | { ok: true; items: AmazonItem[]; waitingCount: number; limited: boolean }
  | { ok: false; error: string };

export type GradeOption = { id: string; code: string; label: string; inInventory: boolean };

// Plenty for a day's work; the oldest waiting (or newest listed) come first.
const PAGE_LIMIT = 300;

async function requireLister() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { ok: false as const, error: "Not signed in." };
  const profile = await fetchProfileRoles(supabase, user.id);
  if (!profile || !hasRole(profile.roles, "amazon")) {
    return { ok: false as const, error: "Only an Amazon lister can do that." };
  }
  return { ok: true as const, supabase };
}

function setupHint(code: string | undefined, message: string) {
  // The table, function or column isn't there — the migration hasn't been run.
  if (["PGRST205", "42P01", "42883", "PGRST202", "42703", "PGRST204", "PGRST200"].includes(code ?? "")) {
    return "Amazon listing needs a database update — run supabase/migration_17_amazon_listing_and_grade_log.sql in Supabase.";
  }
  return message;
}

const SELECT = `unit_id, added_at, source, listed_at, listed_by,
  units!inner ( id, serial_number, note, status, tested_at, tester_id,
    sku_lines!inner ( grade_id, grades ( code ),
      model_variants!inner ( color, variant_asins ( asin, position ), models!inner ( name, brands!inner ( name ) ) ) ) )`;

type RawRow = {
  unit_id: string;
  added_at: string;
  source: "tested" | "repaired";
  listed_at: string | null;
  listed_by: string | null;
  units: unknown;
};

type RawUnit = {
  id: string;
  serial_number: string | null;
  note: string | null;
  status: string;
  tested_at: string;
  tester_id: string;
  sku_lines: {
    grade_id: string;
    grades: { code: string };
    model_variants: {
      color: string;
      variant_asins: { asin: string; position: number }[] | null;
      models: { name: string; brands: { name: string } };
    };
  };
};

export async function listAmazonItems(filter: AmazonFilter): Promise<AmazonList> {
  const auth = await requireLister();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  let query = supabase.from("amazon_queue").select(SELECT).limit(PAGE_LIMIT + 1);
  query =
    filter === "waiting"
      ? query.is("listed_at", null).order("added_at", { ascending: true })
      : query.not("listed_at", "is", null).order("listed_at", { ascending: false });

  const [list, waiting] = await Promise.all([
    query,
    supabase.from("amazon_queue").select("unit_id", { count: "exact", head: true }).is("listed_at", null),
  ]);
  if (list.error) return { ok: false, error: setupHint(list.error.code, list.error.message) };

  const raw = ((list.data ?? []) as unknown as RawRow[]).slice(0, PAGE_LIMIT);
  const unitIds = raw.map((r) => r.unit_id);

  const { data: history } = unitIds.length
    ? await supabase
        .from("grade_changes")
        .select("unit_id, from_grade, to_grade, changed_at, changed_by")
        .in("unit_id", unitIds)
        .order("changed_at")
    : { data: [] };

  // Staff names aren't readable by everyone — look them up with the server key.
  const people = new Set<string>();
  for (const r of raw) {
    people.add((r.units as RawUnit).tester_id);
    if (r.listed_by) people.add(r.listed_by);
  }
  for (const h of history ?? []) if (h.changed_by) people.add(h.changed_by);
  const { data: profiles } = people.size
    ? await createAdminClient().from("profiles").select("id, full_name").in("id", [...people])
    : { data: [] as { id: string; full_name: string }[] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const historyByUnit = new Map<string, AmazonItem["gradeHistory"]>();
  for (const h of history ?? []) {
    const list = historyByUnit.get(h.unit_id) ?? [];
    list.push({ from: h.from_grade, to: h.to_grade, at: h.changed_at, byName: h.changed_by ? (names.get(h.changed_by) ?? null) : null });
    historyByUnit.set(h.unit_id, list);
  }

  const items: AmazonItem[] = raw.map((r) => {
    const unit = r.units as RawUnit;
    const variant = unit.sku_lines.model_variants;
    return {
      unitId: r.unit_id,
      brand: variant.models.brands.name,
      model: variant.models.name,
      color: variant.color,
      gradeId: unit.sku_lines.grade_id,
      grade: unit.sku_lines.grades.code,
      serialNumber: unit.serial_number,
      note: unit.note,
      asins: (variant.variant_asins ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((a) => a.asin),
      source: r.source,
      addedAt: r.added_at,
      testedAt: unit.tested_at,
      testerName: names.get(unit.tester_id) ?? null,
      inStock: unit.status === "in_stock",
      listedAt: r.listed_at,
      listedByName: r.listed_by ? (names.get(r.listed_by) ?? null) : null,
      gradeHistory: historyByUnit.get(r.unit_id) ?? [],
    };
  });

  return {
    ok: true,
    items,
    waitingCount: waiting.count ?? 0,
    limited: ((list.data ?? []) as unknown[]).length > PAGE_LIMIT,
  };
}

export async function listGradeOptions(): Promise<GradeOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("grades").select("id, code, label, in_inventory").order("sort_order").order("code");
  return ((data ?? []) as { id: string; code: string; label: string; in_inventory: boolean | null }[]).map((g) => ({
    id: g.id,
    code: g.code,
    label: g.label,
    inInventory: g.in_inventory !== false,
  }));
}

export type CheckResult =
  | { ok: true; regraded: boolean; grade: string; listed: boolean }
  | { ok: false; error: string };

// Marks the item listed (and checked by this person). A different grade moves
// it to that grade first — the caller then prints its new label.
export async function checkAndList(unitId: string, gradeId: string): Promise<CheckResult> {
  const auth = await requireLister();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase.rpc("amazon_check_unit", {
    p_unit_id: unitId,
    p_grade_id: gradeId || null,
  });
  if (error) return { ok: false, error: setupHint(error.code, error.message) };

  const result = data as { regraded: boolean; grade: string; listed: boolean };
  revalidatePath("/amazon");
  revalidatePath("/admin/inventory");
  revalidatePath("/repair");
  revalidatePath("/clearance");
  return { ok: true, ...result };
}
