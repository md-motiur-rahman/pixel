"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { fetchProfileRoles, hasRole } from "@/lib/roles";
import { parsePrice } from "@/lib/money";

// One camera a picker has picked. Brand, model, colour and serial come from the
// camera itself; the selling price (and a missing serial) is what the master
// stocker adds.
export type MasterStockRow = {
  unitId: string;
  brand: string;
  model: string;
  color: string;
  grade: string;
  /** Null when the camera has no serial number yet. */
  serialNumber: string | null;
  note: string | null;
  pickedAt: string;
  pickedByName: string | null;
  /** Null until the master stocker has priced it. */
  sellingPrice: number | null;
};

export type MasterStockFilter = "todo" | "done" | "all";

export type MasterStockList =
  | { ok: true; rows: MasterStockRow[]; todoCount: number; limited: boolean }
  | { ok: false; error: string };

// Plenty for a working day, and keeps the page quick when the "done" history
// grows. The newest are always the ones shown.
const PAGE_LIMIT = 300;

const SELECT = `unit_id, picked_at, selling_price,
  picker:profiles!master_stock_picked_by_fkey ( full_name ),
  units!inner ( serial_number, note,
    sku_lines!inner ( grades ( code ), model_variants!inner ( color, models!inner ( name, brands!inner ( name ) ) ) ) )`;

// Master stockers and admins only. The database enforces the same rule (row level
// security) — this check just gives a clear message.
async function requireMasterStocker() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { ok: false as const, error: "Not signed in." };
  const profile = await fetchProfileRoles(supabase, user.id);
  if (!profile || !hasRole(profile.roles, "master_stocker")) {
    return { ok: false as const, error: "Only a master stocker can do that." };
  }
  return { ok: true as const, supabase };
}

function setupHint(code: string | undefined, message: string) {
  // PGRST205 / 42P01: the master_stock table doesn't exist; 42883 / PGRST202: the function doesn't.
  if (code === "PGRST205" || code === "42P01" || code === "42883" || code === "PGRST202") {
    return "Master stock needs a database update — run supabase/migration_9_multi_role_master_stock.sql in Supabase.";
  }
  return message;
}

type RawRow = {
  unit_id: string;
  picked_at: string;
  selling_price: number | null;
  picker: unknown;
  units: unknown;
};

function toRow(raw: RawRow): MasterStockRow {
  const unit = raw.units as {
    serial_number: string | null;
    note: string | null;
    sku_lines: {
      grades: { code: string };
      model_variants: { color: string; models: { name: string; brands: { name: string } } };
    };
  };
  const picker = raw.picker as { full_name: string } | null;
  const variant = unit.sku_lines.model_variants;
  return {
    unitId: raw.unit_id,
    brand: variant.models.brands.name,
    model: variant.models.name,
    color: variant.color,
    grade: unit.sku_lines.grades.code,
    serialNumber: unit.serial_number,
    note: unit.note,
    pickedAt: raw.picked_at,
    pickedByName: picker?.full_name ?? null,
    // numeric columns can arrive as strings depending on the driver; always hand back a number.
    sellingPrice: raw.selling_price === null ? null : Number(raw.selling_price),
  };
}

export async function listMasterStock(filter: MasterStockFilter): Promise<MasterStockList> {
  const auth = await requireMasterStocker();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  let query = supabase.from("master_stock").select(SELECT).order("picked_at", { ascending: false }).limit(PAGE_LIMIT + 1);
  if (filter === "todo") query = query.is("selling_price", null);
  if (filter === "done") query = query.not("selling_price", "is", null);

  const [list, todo] = await Promise.all([
    query,
    supabase.from("master_stock").select("unit_id", { count: "exact", head: true }).is("selling_price", null),
  ]);
  if (list.error) return { ok: false, error: setupHint(list.error.code, list.error.message) };

  const raw = (list.data ?? []) as unknown as RawRow[];
  return {
    ok: true,
    rows: raw.slice(0, PAGE_LIMIT).map(toRow),
    todoCount: todo.count ?? 0,
    limited: raw.length > PAGE_LIMIT,
  };
}

export type SaveMasterStockResult =
  | { ok: true; sellingPrice: number | null; serialNumber: string | null }
  | { ok: false; error: string };

export async function saveMasterStockDetails(
  unitId: string,
  sellingPrice: string,
  serialNumber: string
): Promise<SaveMasterStockResult> {
  const auth = await requireMasterStocker();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  // Both are optional: a blank price leaves the stored one as it is, but anything
  // typed must be a real amount.
  let price: number | null = null;
  if (sellingPrice.trim()) {
    const parsed = parsePrice(sellingPrice, "selling price");
    if (!parsed.ok) return { ok: false, error: parsed.error };
    price = parsed.value;
  }
  const serial = serialNumber.trim();
  if (price === null && !serial) return { ok: false, error: "Enter a selling price or a serial number to save." };

  const { error } = await supabase.rpc("set_master_stock_details", {
    p_unit_id: unitId,
    p_selling_price: price,
    p_serial: serial || null,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `Serial number "${serial}" is already used by another camera.` };
    }
    return { ok: false, error: setupHint(error.code, error.message) };
  }

  // Read back what was actually stored — a serial already on the camera is never
  // replaced, and a blank price kept whatever price was there.
  const [{ data: unit }, { data: stock }] = await Promise.all([
    supabase.from("units").select("serial_number").eq("id", unitId).maybeSingle(),
    supabase.from("master_stock").select("selling_price").eq("unit_id", unitId).maybeSingle(),
  ]);
  return {
    ok: true,
    sellingPrice: stock?.selling_price == null ? null : Number(stock.selling_price),
    serialNumber: unit?.serial_number ?? null,
  };
}
