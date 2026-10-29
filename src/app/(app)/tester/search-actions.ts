"use server";

import { createClient } from "@/lib/supabase/server";
import type { ComboboxOption } from "@/components/combobox";
import { escapeLikePattern } from "@/lib/escape-like";
import { canonicalColor } from "@/lib/colors";

export async function searchBrands(query: string): Promise<ComboboxOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("brands")
    .select("id, name")
    .ilike("name", `%${escapeLikePattern(query)}%`)
    .order("name")
    .limit(20);
  return (data ?? []).map((b) => ({ id: b.id, label: b.name }));
}

export async function searchModels(brandId: string, query: string): Promise<ComboboxOption[]> {
  if (!brandId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("models")
    .select("id, name")
    .eq("brand_id", brandId)
    .ilike("name", `%${escapeLikePattern(query)}%`)
    .order("name")
    .limit(20);
  return (data ?? []).map((m) => ({ id: m.id, label: m.name }));
}

// The ASINs data entry staff have added for a model — the tester picks one when
// logging an item. Empty (not an error) if there are none or the table isn't set up yet.
// The ASINs data entry added for this model in this colour — plus any older ones
// entered before colours were recorded (those apply to every colour).
export async function listModelAsins(modelId: string, color: string): Promise<string[]> {
  if (!modelId || !color.trim()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("model_asins")
    .select("asin, color")
    .eq("model_id", modelId)
    .order("created_at");
  // Before migration_14 there's no colour column — fall back to the model's list.
  if (error) {
    const legacy = await supabase.from("model_asins").select("asin").eq("model_id", modelId).order("created_at");
    return (legacy.data ?? []).map((row) => row.asin);
  }
  const wanted = canonicalColor(color).toLowerCase();
  const asins = (data ?? [])
    .filter((row) => row.color === null || canonicalColor(row.color).toLowerCase() === wanted)
    .map((row) => row.asin);
  return [...new Set(asins)];
}

// The colours this model is already known in — entered by data entry or logged
// before — so the tester can tap one instead of hunting through the full list.
export async function listModelColours(modelId: string): Promise<string[]> {
  if (!modelId) return [];
  const supabase = await createClient();
  const [variants, asins] = await Promise.all([
    supabase.from("model_variants").select("color").eq("model_id", modelId),
    supabase.from("model_asins").select("color").eq("model_id", modelId),
  ]);
  const byKey = new Map<string, string>();
  const rows = [...(variants.data ?? []), ...((asins.error ? [] : asins.data) ?? [])] as { color: string | null }[];
  for (const row of rows) {
    if (!row.color?.trim()) continue;
    const name = canonicalColor(row.color);
    if (!byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

export async function listGrades() {
  const supabase = await createClient();
  const { data } = await supabase.from("grades").select("id, code, label").order("sort_order");
  return data ?? [];
}
