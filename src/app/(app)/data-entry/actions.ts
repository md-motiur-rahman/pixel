"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { escapeLikePattern } from "@/lib/escape-like";
import { findOrCreate } from "@/lib/find-or-create";
import { validateAsins } from "@/lib/asin";
import { fetchProfileRoles, hasRole } from "@/lib/roles";
import { canonicalColor } from "@/lib/colors";
import type { SupabaseClient } from "@supabase/supabase-js";

// A model can have several ASINs (Amazon lists one per colour), so this list is
// longer than the 3 a single model + colour row can hold.
const MAX_MODEL_ASINS = 20;

// Each model + colour has its own ASIN(s). `color` is null only for ASINs entered
// before colours were recorded — those still apply to every colour of the model.
export type ModelEntry = {
  modelId: string;
  brand: string;
  model: string;
  asins: { id: string; asin: string; color: string | null }[];
};

type Result = { ok: true; message: string } | { ok: false; error: string };

// Data entry staff and admins only. The database enforces the same rules (row
// level security) — this check just gives a clear message.
async function requireDataEntry() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { ok: false as const, error: "Not signed in." };
  const profile = await fetchProfileRoles(supabase, user.id);
  if (!profile || !hasRole(profile.roles, "data_entry")) {
    return { ok: false as const, error: "Only data entry staff can do that." };
  }
  return { ok: true as const, supabase, userId: user.id };
}

function setupHint(code: string | undefined, message: string) {
  // PGRST205 / 42P01: the model_asins table doesn't exist — the migration hasn't been run.
  if (code === "PGRST205" || code === "42P01") {
    return "Data entry needs a database update — run supabase/migration_7_data_entry_role.sql in Supabase.";
  }
  // 42703 / PGRST204: there's no model_asins.color yet.
  if (code === "42703" || code === "PGRST204") {
    return "ASINs per colour need a database update — run supabase/migration_14_asins_per_model_colour_entry.sql in Supabase.";
  }
  return message;
}

type RawModel = {
  id: string;
  name: string;
  brands: unknown;
  model_asins: unknown;
};

function toEntry(m: RawModel): ModelEntry {
  const asins = (m.model_asins ?? []) as { id: string; asin: string; color: string | null; created_at: string }[];
  return {
    modelId: m.id,
    brand: (m.brands as { name: string }).name,
    model: m.name,
    asins: asins
      .slice()
      .sort((a, b) => (a.color ?? "").localeCompare(b.color ?? "") || a.created_at.localeCompare(b.created_at))
      .map(({ id, asin, color }) => ({ id, asin, color })),
  };
}

const MODEL_SELECT = "id, name, brands ( name ), model_asins ( id, asin, color, created_at )";

// Adds the ASINs this model + colour doesn't have yet. Returns how many were new.
async function addAsinsForColour(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  modelId: string,
  color: string,
  asins: string[],
  userId: string
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const { data: existing, error: readError } = await supabase
    .from("model_asins")
    .select("asin, color")
    .eq("model_id", modelId)
    .ilike("color", escapeLikePattern(color));
  if (readError) return { ok: false, error: setupHint(readError.code, readError.message) };

  const have = new Set(((existing ?? []) as { asin: string }[]).map((row) => row.asin));
  const fresh = asins.filter((asin) => !have.has(asin));
  if (fresh.length === 0) return { ok: true, added: 0 };

  const { error } = await supabase
    .from("model_asins")
    .insert(fresh.map((asin) => ({ model_id: modelId, color, asin, created_by: userId })));
  if (error) {
    // Someone added the same one a moment ago — nothing to do.
    if (error.code === "23505") return { ok: true, added: 0 };
    return { ok: false, error: setupHint(error.code, error.message) };
  }
  return { ok: true, added: fresh.length };
}

// With a search: models whose name — or brand — matches. Without one: the most
// recently added ASINs' models, so the latest entries are right there.
export async function listModelEntries(query: string): Promise<ModelEntry[]> {
  const auth = await requireDataEntry();
  if (!auth.ok) return [];
  const { supabase } = auth;
  const q = query.trim();

  if (q) {
    const pattern = `%${escapeLikePattern(q)}%`;
    const [byName, brandMatches] = await Promise.all([
      supabase.from("models").select(MODEL_SELECT).ilike("name", pattern).order("name").limit(40),
      supabase.from("brands").select("id").ilike("name", pattern).limit(20),
    ]);
    const brandIds = (brandMatches.data ?? []).map((b) => b.id);
    const byBrand = brandIds.length
      ? await supabase.from("models").select(MODEL_SELECT).in("brand_id", brandIds).order("name").limit(40)
      : { data: [] as RawModel[] };

    const seen = new Map<string, RawModel>();
    for (const m of [...(byName.data ?? []), ...(byBrand.data ?? [])] as RawModel[]) seen.set(m.id, m);
    return [...seen.values()].map(toEntry).slice(0, 40);
  }

  const { data: recent } = await supabase
    .from("model_asins")
    .select("model_id")
    .order("created_at", { ascending: false })
    .limit(200);
  const ids = [...new Set((recent ?? []).map((r) => r.model_id))].slice(0, 30);
  if (ids.length === 0) return [];

  const { data } = await supabase.from("models").select(MODEL_SELECT).in("id", ids);
  const byId = new Map((data ?? ([] as RawModel[])).map((m) => [m.id, m as RawModel]));
  return ids.flatMap((id) => (byId.has(id) ? [toEntry(byId.get(id)!)] : []));
}

export async function addModelEntry(input: {
  brandId: string | null;
  brandName: string;
  modelId: string | null;
  modelName: string;
  color: string;
  asins: string[];
}): Promise<Result> {
  const auth = await requireDataEntry();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth;

  const brandName = input.brandName.trim();
  const modelName = input.modelName.trim();
  if (!brandName) return { ok: false, error: "Enter or pick a brand." };
  if (!modelName) return { ok: false, error: "Enter or pick a model." };
  const color = canonicalColor(input.color);
  if (!color) return { ok: false, error: "Pick the colour these ASINs are for." };
  const checked = validateAsins(input.asins, MAX_MODEL_ASINS);
  if (!checked.ok) return { ok: false, error: checked.error };

  let brandId = input.brandId;
  if (!brandId) {
    const result = await findOrCreate(
      async () => supabase.from("brands").select("id").ilike("name", escapeLikePattern(brandName)).maybeSingle(),
      async () => supabase.from("brands").insert({ name: brandName }).select("id").single()
    );
    if (!result.ok) return { ok: false, error: `Could not save brand: ${result.error}` };
    brandId = result.id;
  }

  let modelId = input.modelId;
  if (!modelId) {
    const result = await findOrCreate(
      async () =>
        supabase
          .from("models")
          .select("id")
          .eq("brand_id", brandId)
          .ilike("name", escapeLikePattern(modelName))
          .maybeSingle(),
      async () => supabase.from("models").insert({ brand_id: brandId, name: modelName }).select("id").single()
    );
    if (!result.ok) return { ok: false, error: `Could not save model: ${result.error}` };
    modelId = result.id;
  }

  const saved = await addAsinsForColour(supabase, modelId!, color, checked.asins, userId);
  if (!saved.ok) return saved;

  revalidatePath("/data-entry");
  const count = saved.added;
  const skipped = checked.asins.length - count;
  return {
    ok: true,
    message:
      `${brandName} ${modelName} (${color}) saved — ${count} ASIN${count === 1 ? "" : "s"} added` +
      (skipped > 0 ? ` (${skipped} already on this colour).` : "."),
  };
}

export async function addAsinToModel(modelId: string, colorInput: string, asin: string): Promise<Result> {
  const auth = await requireDataEntry();
  if (!auth.ok) return auth;

  const color = canonicalColor(colorInput);
  if (!color) return { ok: false, error: "Pick the colour this ASIN is for." };
  const checked = validateAsins([asin], 1);
  if (!checked.ok) return { ok: false, error: checked.error };

  const saved = await addAsinsForColour(auth.supabase, modelId, color, checked.asins, auth.userId);
  if (!saved.ok) return saved;
  if (saved.added === 0) return { ok: false, error: `${checked.asins[0]} is already on ${color}.` };

  revalidatePath("/data-entry");
  return { ok: true, message: "ASIN added." };
}

export async function removeModelAsin(asinId: string): Promise<Result> {
  const auth = await requireDataEntry();
  if (!auth.ok) return auth;

  const { error } = await auth.supabase.from("model_asins").delete().eq("id", asinId);
  if (error) return { ok: false, error: setupHint(error.code, error.message) };

  revalidatePath("/data-entry");
  return { ok: true, message: "ASIN removed." };
}
