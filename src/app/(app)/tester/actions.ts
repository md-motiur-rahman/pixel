"use server";

import { createClient } from "@/lib/supabase/server";
import { escapeLikePattern } from "@/lib/escape-like";
import { findOrCreate } from "@/lib/find-or-create";
import { canonicalColor } from "@/lib/colors";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { parsePrice } from "@/lib/money";

export type CreateTestedUnitInput = {
  brandId: string | null;
  brandName: string;
  modelId: string | null;
  modelName: string;
  color: string;
  gradeId: string;
  serialNumber: string;
  note: string;
  /** What the camera cost, as typed. Optional for now — blank saves no price. */
  buyingPrice: string;
  /** One of the model's ASINs (from data entry), picked from the dropdown. */
  asin?: string;
};

export type CreateTestedUnitResult =
  | { ok: true; unitId: string }
  | { ok: false; error: string };

export async function createTestedUnit(
  input: CreateTestedUnitInput
): Promise<CreateTestedUnitResult> {
  const supabase = await createClient();

  const user = await getAuthUser(supabase);
  if (!user) return { ok: false, error: "Not signed in." };

  const brandName = input.brandName.trim();
  const modelName = input.modelName.trim();
  const color = canonicalColor(input.color);
  const serialNumber = input.serialNumber.trim();

  if (!brandName || !modelName || !color || !input.gradeId) {
    return { ok: false, error: "Brand, model, color and grade are required." };
  }

  // Optional for now (to be made required later): blank saves no price, but anything
  // typed must be a real amount. Checked up front, like the serial below, so a bad
  // price can't leave a new brand/model/color behind.
  let buyingPrice: number | null = null;
  if (input.buyingPrice.trim()) {
    const price = parsePrice(input.buyingPrice, "buying price");
    if (!price.ok) return { ok: false, error: price.error };
    buyingPrice = price.value;
  }

  // 0. Serial first (when there is one) — a duplicate would otherwise only fail at
  //    the very end, after a new brand/model/color had already been created for nothing.
  //    A serial number is optional: the camera is identified by its own id.
  if (serialNumber) {
    const { data: serialRows, error: serialCheckError } = await supabase
      .from("units")
      .select("id")
      .ilike("serial_number", escapeLikePattern(serialNumber))
      .limit(1);
    if (serialCheckError) return { ok: false, error: `Could not check serial number: ${serialCheckError.message}` };
    if (serialRows && serialRows.length > 0) {
      return { ok: false, error: `Serial number "${serialNumber}" is already in the system.` };
    }
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

  // 4b. The ASIN the tester picked becomes an ASIN of this model + colour. The
  //     database function only accepts one that really belongs to the model.
  const pickedAsin = input.asin?.trim();
  if (pickedAsin) {
    const { error: asinError } = await supabase.rpc("attach_model_asin_to_variant", {
      p_variant_id: variantId,
      p_asin: pickedAsin,
    });
    if (asinError) return { ok: false, error: `Could not save the ASIN: ${asinError.message}` };
  }

  // 5. Unit — the physical camera being tested right now.
  const { data: unit, error: unitError } = await supabase
    .from("units")
    .insert({
      sku_line_id: skuLineId,
      serial_number: serialNumber || null,
      note: input.note.trim() || null,
      tester_id: user.id,
      ...(buyingPrice === null ? {} : { buying_price: buyingPrice }),
    })
    .select("id")
    .single();

  if (unitError) {
    if (unitError.code === "23505") {
      return { ok: false, error: `Serial number "${serialNumber}" is already in the system.` };
    }
    // 42703 / PGRST204: the buying_price column doesn't exist — the migration hasn't been run.
    if (unitError.code === "42703" || unitError.code === "PGRST204") {
      return {
        ok: false,
        error: "Saving a buying price needs a database update — run supabase/migration_9_multi_role_master_stock.sql in Supabase.",
      };
    }
    return { ok: false, error: `Could not save unit: ${unitError.message}` };
  }

  return { ok: true, unitId: unit.id };
}
