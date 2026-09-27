"use server";

import { createClient } from "@/lib/supabase/server";
import type { UnitStatus } from "@/types/database";

export type UnitDetails = {
  id: string;
  brand: string;
  model: string;
  color: string;
  grade: string;
  serialNumber: string;
  note: string | null;
  status: UnitStatus;
  testerName: string;
  testedAt: string;
  pickedByName: string | null;
  pickedAt: string | null;
};

type UnitLookupResult =
  | { ok: true; unit: UnitDetails }
  | { ok: false; error: string };

async function loadUnitDetails(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string
): Promise<UnitLookupResult> {
  const { data, error } = await supabase
    .from("units")
    .select(
      `id, serial_number, note, status, tested_at, picked_at,
       tester:profiles!units_tester_id_fkey ( full_name ),
       picker:profiles!units_picked_by_fkey ( full_name ),
       sku_lines ( grades ( code ), model_variants ( color, models ( name, brands ( name ) ) ) )`
    )
    .eq("id", unitId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No camera found for that QR code." };

  const skuLine = data.sku_lines as unknown as {
    grades: { code: string };
    model_variants: { color: string; models: { name: string; brands: { name: string } } };
  };
  const tester = data.tester as unknown as { full_name: string } | null;
  const picker = data.picker as unknown as { full_name: string } | null;

  return {
    ok: true,
    unit: {
      id: data.id,
      brand: skuLine.model_variants.models.brands.name,
      model: skuLine.model_variants.models.name,
      color: skuLine.model_variants.color,
      grade: skuLine.grades.code,
      serialNumber: data.serial_number,
      note: data.note,
      status: data.status,
      testerName: tester?.full_name ?? "Unknown",
      testedAt: data.tested_at,
      pickedByName: picker?.full_name ?? null,
      pickedAt: data.picked_at,
    },
  };
}

export async function lookupUnit(rawScan: string): Promise<UnitLookupResult> {
  const unitId = rawScan.trim();
  if (!unitId) return { ok: false, error: "Empty scan." };
  const supabase = await createClient();
  return loadUnitDetails(supabase, unitId);
}

export async function pickUnit(unitId: string): Promise<UnitLookupResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data, error } = await supabase
    .from("units")
    .update({ status: "picked", picked_by: user.id, picked_at: new Date().toISOString() })
    .eq("id", unitId)
    .eq("status", "in_stock")
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "This camera was already picked by someone else." };
  }

  return loadUnitDetails(supabase, unitId);
}

export async function undoPick(unitId: string): Promise<UnitLookupResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("units")
    .update({ status: "in_stock", picked_by: null, picked_at: null })
    .eq("id", unitId)
    .eq("status", "picked")
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "This camera isn't currently picked, so there's nothing to undo." };
  }

  return loadUnitDetails(supabase, unitId);
}
