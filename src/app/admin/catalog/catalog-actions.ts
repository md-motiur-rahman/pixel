"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { escapeLikePattern } from "@/lib/escape-like";

type ActionResult = { ok: true } | { ok: false; error: string };

export type BrandRow = { id: string; name: string };
export type ModelRow = { id: string; name: string; brandId: string; brandName: string };
export type VariantRow = { id: string; color: string };

// ── Brands ──────────────────────────────────────────────────────────
export async function listAllBrands(): Promise<BrandRow[]> {
  const admin = await requireAdmin();
  if (!admin.ok) return [];
  const { data } = await admin.supabase.from("brands").select("id, name").order("name");
  return data ?? [];
}

export async function renameBrand(id: string, name: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const { error } = await admin.supabase.from("brands").update({ name: name.trim() }).eq("id", id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Another brand already has that name — merge instead." };
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/catalog");
  return { ok: true };
}

export async function mergeBrandsAction(sourceId: string, targetId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const { error } = await admin.supabase.rpc("merge_brands", { source_id: sourceId, target_id: targetId });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/catalog");
  return { ok: true };
}

// ── Models ──────────────────────────────────────────────────────────
export async function searchModelsAdmin(query: string): Promise<ModelRow[]> {
  const admin = await requireAdmin();
  if (!admin.ok) return [];
  if (!query.trim()) return [];
  const { data } = await admin.supabase
    .from("models")
    .select("id, name, brand_id, brands ( name )")
    .ilike("name", `%${escapeLikePattern(query)}%`)
    .order("name")
    .limit(30);
  return (data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    brandId: m.brand_id,
    brandName: (m.brands as unknown as { name: string }).name,
  }));
}

export async function renameModel(id: string, name: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const { error } = await admin.supabase.from("models").update({ name: name.trim() }).eq("id", id);
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "This brand already has a model with that name — merge instead." };
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/catalog");
  return { ok: true };
}

export async function mergeModelsAction(sourceId: string, targetId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const { error } = await admin.supabase.rpc("merge_models", { source_id: sourceId, target_id: targetId });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/catalog");
  return { ok: true };
}

// ── Colors (variants), scoped to one model at a time ──────────────────
export async function listVariantsForModel(modelId: string): Promise<VariantRow[]> {
  const admin = await requireAdmin();
  if (!admin.ok) return [];
  const { data } = await admin.supabase
    .from("model_variants")
    .select("id, color")
    .eq("model_id", modelId)
    .order("color");
  return data ?? [];
}

export async function renameVariant(id: string, color: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const { error } = await admin.supabase
    .from("model_variants")
    .update({ color: color.trim() })
    .eq("id", id);
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "This model already has that color — merge instead." };
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/catalog");
  return { ok: true };
}

export async function mergeVariantsAction(sourceId: string, targetId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const { error } = await admin.supabase.rpc("merge_variants", { source_id: sourceId, target_id: targetId });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/catalog");
  return { ok: true };
}
