"use server";

import { createClient } from "@/lib/supabase/server";
import { escapeLikePattern } from "@/lib/escape-like";
import { findOrCreate } from "@/lib/find-or-create";

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
    const result = await findOrCreate(
      async () =>
        supabase.from("brands").select("id").ilike("name", escapeLikePattern(brandName)).maybeSingle(),
      async () => supabase.from("brands").insert({ name: brandName }).select("id").single()
    );
    if (!result.ok) return { ok: false, error: `Could not save brand: ${result.error}` };
    brandId = result.id;
  }

  // 2. Model — reuse selected id, or find/create by (brand, name).
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

  // 3. Variant (model + color) — find or create.
  const variantResult = await findOrCreate(
    async () =>
      supabase
        .from("model_variants")
        .select("id")
        .eq("model_id", modelId)
        .ilike("color", escapeLikePattern(color))
        .maybeSingle(),
    async () => supabase.from("model_variants").insert({ model_id: modelId, color }).select("id").single()
  );
  if (!variantResult.ok) return { ok: false, error: `Could not save color: ${variantResult.error}` };
  const variantId = variantResult.id;

  // 4. SKU line (variant + grade) — find or create, generating the QR code.
  const skuLineResult = await findOrCreate(
    async () =>
      supabase
        .from("sku_lines")
        .select("id")
        .eq("model_variant_id", variantId)
        .eq("grade_id", input.gradeId)
        .maybeSingle(),
    async () => {
      const { data: code, error: codeError } = await supabase.rpc("next_sku_code");
      if (codeError) return { data: null, error: codeError };
      return supabase
        .from("sku_lines")
        .insert({ model_variant_id: variantId, grade_id: input.gradeId, code })
        .select("id")
        .single();
    }
  );
  if (!skuLineResult.ok) return { ok: false, error: `Could not save SKU line: ${skuLineResult.error}` };
  const skuLineId = skuLineResult.id;

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
