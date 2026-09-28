"use server";

import { createClient } from "@/lib/supabase/server";
import { escapeLikePattern, looksLikeUuid } from "@/lib/escape-like";
import { findOrCreate } from "@/lib/find-or-create";

export type EditableUnit = {
  id: string;
  brandId: string;
  brand: string;
  modelId: string;
  model: string;
  color: string;
  gradeId: string;
  gradeCode: string;
  serialNumber: string;
  note: string | null;
  modelVariantId: string;
};

type FindResult = { ok: true; unit: EditableUnit } | { ok: false; error: string };

const SELECT = `id, serial_number, note,
  sku_lines ( model_variant_id, grade_id, grades ( code ),
    model_variants ( color, models ( id, name, brand_id, brands ( name ) ) ) )`;

function toEditableUnit(data: {
  id: string;
  serial_number: string;
  note: string | null;
  sku_lines: unknown;
}): EditableUnit {
  const skuLine = data.sku_lines as unknown as {
    model_variant_id: string;
    grade_id: string;
    grades: { code: string };
    model_variants: {
      color: string;
      models: { id: string; name: string; brand_id: string; brands: { name: string } };
    };
  };
  return {
    id: data.id,
    brandId: skuLine.model_variants.models.brand_id,
    brand: skuLine.model_variants.models.brands.name,
    modelId: skuLine.model_variants.models.id,
    model: skuLine.model_variants.models.name,
    color: skuLine.model_variants.color,
    gradeId: skuLine.grade_id,
    gradeCode: skuLine.grades.code,
    serialNumber: data.serial_number,
    note: data.note,
    modelVariantId: skuLine.model_variant_id,
  };
}

export async function findUnitForEdit(rawInput: string): Promise<FindResult> {
  const value = rawInput.trim();
  if (!value) return { ok: false, error: "Scan a QR or type a serial number." };
  const supabase = await createClient();

  // units.id is a uuid column — querying it with a non-uuid value (e.g. a
  // typed-in serial number) throws a Postgres cast error, so only attempt
  // this when the input is actually shaped like a QR-scanned id.
  if (looksLikeUuid(value)) {
    const { data: byId } = await supabase.from("units").select(SELECT).eq("id", value).maybeSingle();
    if (byId) return { ok: true, unit: toEditableUnit(byId) };
  }

  const { data: bySerial, error: serialError } = await supabase
    .from("units")
    .select(SELECT)
    .ilike("serial_number", escapeLikePattern(value))
    .maybeSingle();
  if (serialError) return { ok: false, error: serialError.message };
  if (bySerial) return { ok: true, unit: toEditableUnit(bySerial) };

  return { ok: false, error: "No camera found for that QR code or serial number." };
}

export type UpdateUnitDetailsInput = {
  brandId: string | null;
  brandName: string;
  modelId: string | null;
  modelName: string;
  color: string;
  gradeId: string;
  serialNumber: string;
  note: string;
};

export async function updateUnitDetails(
  unitId: string,
  input: UpdateUnitDetailsInput
): Promise<FindResult> {
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

  // Same find-or-create cascade as creating a unit — a tester correcting a
  // mistyped brand/model/color here goes through the identical catalog path
  // as first logging the camera, rather than trusting a raw variant id.
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
  const modelVariantId = variantResult.id;

  const skuLineResult = await findOrCreate(
    async () =>
      supabase
        .from("sku_lines")
        .select("id")
        .eq("model_variant_id", modelVariantId)
        .eq("grade_id", input.gradeId)
        .maybeSingle(),
    async () => {
      const { data: code, error: codeError } = await supabase.rpc("next_sku_code");
      if (codeError) return { data: null, error: codeError };
      return supabase
        .from("sku_lines")
        .insert({ model_variant_id: modelVariantId, grade_id: input.gradeId, code })
        .select("id")
        .single();
    }
  );
  if (!skuLineResult.ok) return { ok: false, error: `Could not save SKU line: ${skuLineResult.error}` };
  const skuLineId = skuLineResult.id;

  const { data: updated, error } = await supabase
    .from("units")
    .update({ sku_line_id: skuLineId, serial_number: serialNumber, note: input.note.trim() || null })
    .eq("id", unitId)
    .select("id");

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `Serial number "${serialNumber}" is already used by another camera.` };
    }
    return { ok: false, error: error.message };
  }
  // A blocked RLS policy or an id that no longer exists both update zero
  // rows without Postgres raising an error — check explicitly rather than
  // re-reading a unit that was never actually changed.
  if (!updated || updated.length === 0) {
    return { ok: false, error: "You cannot edit this camera, or it no longer exists." };
  }

  const { data, error: readError } = await supabase.from("units").select(SELECT).eq("id", unitId).single();
  if (readError || !data) {
    return { ok: false, error: "Saved, but could not reload the camera's details." };
  }
  return { ok: true, unit: toEditableUnit(data) };
}
