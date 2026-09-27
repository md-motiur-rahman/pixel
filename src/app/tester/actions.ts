"use server";

import { createClient } from "@/lib/supabase/server";
import { escapeLikePattern } from "@/lib/escape-like";

export type CreateTestedUnitInput = {
  brandId: string | null;
  brandName: string;
  modelId: string | null;
  modelName: string;
  color: string;
  gradeId: string;
  serialNumber: string;
  note: string;
};

export type CreateTestedUnitResult =
  | { ok: true; unitId: string }
  | { ok: false; error: string };

export async function createTestedUnit(
  input: CreateTestedUnitInput
): Promise<CreateTestedUnitResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const brandName = input.brandName.trim();
  const modelName = input.modelName.trim();
  const color = input.color.trim();
  const serialNumber = input.serialNumber.trim();

  if (!brandName || !modelName || !color || !input.gradeId || !serialNumber) {
    return { ok: false, error: "All fields except note are required." };
  }

  // 1. Brand — reuse selected id, or find/create by name.
  let brandId = input.brandId;
  if (!brandId) {
    const { data: existing, error: findError } = await supabase
      .from("brands")
      .select("id")
      .ilike("name", escapeLikePattern(brandName))
      .maybeSingle();
    if (findError) return { ok: false, error: `Could not look up brand: ${findError.message}` };
    brandId = existing?.id ?? null;
    if (!brandId) {
      const { data: created, error } = await supabase
        .from("brands")
        .insert({ name: brandName })
        .select("id")
        .single();
      if (error) return { ok: false, error: `Could not create brand: ${error.message}` };
      brandId = created.id;
    }
  }

  // 2. Model — reuse selected id, or find/create by (brand, name).
  let modelId = input.modelId;
  if (!modelId) {
    const { data: existing, error: findError } = await supabase
      .from("models")
      .select("id")
      .eq("brand_id", brandId)
      .ilike("name", escapeLikePattern(modelName))
      .maybeSingle();
    if (findError) return { ok: false, error: `Could not look up model: ${findError.message}` };
    modelId = existing?.id ?? null;
    if (!modelId) {
      const { data: created, error } = await supabase
        .from("models")
        .insert({ brand_id: brandId, name: modelName })
        .select("id")
        .single();
      if (error) return { ok: false, error: `Could not create model: ${error.message}` };
      modelId = created.id;
    }
  }

  // 3. Variant (model + color) — find or create.
  const { data: existingVariant, error: findVariantError } = await supabase
    .from("model_variants")
    .select("id")
    .eq("model_id", modelId)
    .ilike("color", escapeLikePattern(color))
    .maybeSingle();
  if (findVariantError) return { ok: false, error: `Could not look up color: ${findVariantError.message}` };
  let variantId = existingVariant?.id ?? null;
  if (!variantId) {
    const { data: created, error } = await supabase
      .from("model_variants")
      .insert({ model_id: modelId, color })
      .select("id")
      .single();
    if (error) return { ok: false, error: `Could not create variant: ${error.message}` };
    variantId = created.id;
  }

  // 4. SKU line (variant + grade) — find or create, generating the QR code.
  const { data: existingSkuLine } = await supabase
    .from("sku_lines")
    .select("id")
    .eq("model_variant_id", variantId)
    .eq("grade_id", input.gradeId)
    .maybeSingle();
  let skuLineId = existingSkuLine?.id ?? null;
  if (!skuLineId) {
    const { data: code, error: codeError } = await supabase.rpc("next_sku_code");
    if (codeError) return { ok: false, error: `Could not generate SKU code: ${codeError.message}` };
    const { data: created, error } = await supabase
      .from("sku_lines")
      .insert({ model_variant_id: variantId, grade_id: input.gradeId, code })
      .select("id")
      .single();
    if (error) return { ok: false, error: `Could not create SKU line: ${error.message}` };
    skuLineId = created.id;
  }

  // 5. Unit — the physical camera being tested right now.
  const { data: unit, error: unitError } = await supabase
    .from("units")
    .insert({
      sku_line_id: skuLineId,
      serial_number: serialNumber,
      note: input.note.trim() || null,
      tester_id: user.id,
    })
    .select("id")
    .single();

  if (unitError) {
    if (unitError.code === "23505") {
      return { ok: false, error: `Serial number "${serialNumber}" is already in the system.` };
    }
    return { ok: false, error: `Could not save unit: ${unitError.message}` };
  }

  return { ok: true, unitId: unit.id };
}
