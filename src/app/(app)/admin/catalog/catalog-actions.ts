"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";

type ActionResult = { ok: true } | { ok: false; error: string };


// ── Brands ──────────────────────────────────────────────────────────
export async function renameBrand(id: string, name: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  if (!name.trim()) return { ok: false, error: "Brand name can't be empty." };
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
export async function renameModel(id: string, name: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  if (!name.trim()) return { ok: false, error: "Model name can't be empty." };
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
export async function renameVariant(id: string, color: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  if (!color.trim()) return { ok: false, error: "Color can't be empty." };
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

// ── Browsing (Brands → Models → Colours), with simple counts ──────────
export type CatalogItem = { id: string; name: string; count: number };

/** Every brand, with how many models it has. */
export async function listBrandsWithCounts(): Promise<CatalogItem[]> {
  const admin = await requireAdmin();
  if (!admin.ok) return [];
  const { data } = await admin.supabase.from("brands").select("id, name, models ( count )").order("name");
  return (data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    count: ((b.models as unknown as { count: number }[] | null) ?? [])[0]?.count ?? 0,
  }));
}

/** A brand's models, with how many colours each has. */
export async function listModelsForBrand(brandId: string): Promise<CatalogItem[]> {
  const admin = await requireAdmin();
  if (!admin.ok) return [];
  const { data } = await admin.supabase
    .from("models")
    .select("id, name, model_variants ( count )")
    .eq("brand_id", brandId)
    .order("name");
  return (data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    count: ((m.model_variants as unknown as { count: number }[] | null) ?? [])[0]?.count ?? 0,
  }));
}

/** A model's colours, with how many cameras of each are in stock (all grades). */
export async function listColoursForModel(modelId: string): Promise<CatalogItem[]> {
  const admin = await requireAdmin();
  if (!admin.ok) return [];
  const { data } = await admin.supabase
    .from("model_variants")
    .select("id, color, sku_lines ( quantity )")
    .eq("model_id", modelId)
    .order("color");
  return (data ?? []).map((v) => ({
    id: v.id,
    name: v.color,
    count: ((v.sku_lines as unknown as { quantity: number }[] | null) ?? []).reduce((sum, l) => sum + l.quantity, 0),
  }));
}
