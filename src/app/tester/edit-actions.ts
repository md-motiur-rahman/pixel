"use server";

import { createClient } from "@/lib/supabase/server";
import { escapeLikePattern, looksLikeUuid } from "@/lib/escape-like";
import { findOrCreate } from "@/lib/find-or-create";

export type EditableUnit = {
  id: string;
  brand: string;
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
    model_variants ( color, models ( name, brands ( name ) ) ) )`;

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
    model_variants: { color: string; models: { name: string; brands: { name: string } } };
  };
  return {
    id: data.id,
    brand: skuLine.model_variants.models.brands.name,
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

export async function updateUnitDetails(
  unitId: string,
  input: { serialNumber: string; note: string; gradeId: string }
): Promise<FindResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const serialNumber = input.serialNumber.trim();
  if (!serialNumber) return { ok: false, error: "Serial number is required." };

  // Load the unit's own current model_variant_id server-side rather than
  // trusting a client-supplied value — a caller passing an unrelated variant
  // id here would otherwise silently reclassify this physical camera as a
  // completely different brand/model/color.
  const { data: currentUnit, error: currentUnitError } = await supabase
    .from("units")
    .select("sku_lines ( model_variant_id )")
    .eq("id", unitId)
    .maybeSingle();
  if (currentUnitError) return { ok: false, error: currentUnitError.message };
  if (!currentUnit) return { ok: false, error: "This camera no longer exists." };
  const modelVariantId = (currentUnit.sku_lines as unknown as { model_variant_id: string } | null)
    ?.model_variant_id;
  if (!modelVariantId) return { ok: false, error: "Could not determine this camera's current model." };

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
