"use server";

import { createClient } from "@/lib/supabase/server";
import type { ComboboxOption } from "@/components/combobox";
import { escapeLikePattern } from "@/lib/escape-like";

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

export async function listGrades() {
  const supabase = await createClient();
  const { data } = await supabase.from("grades").select("id, code, label").order("sort_order");
  return data ?? [];
}
