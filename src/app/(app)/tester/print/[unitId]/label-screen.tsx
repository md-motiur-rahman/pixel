import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintActions } from "./print-actions";
import { PrintableLabel } from "./printable-label";
import { DirectPrintButton } from "./direct-print-button";

// First name only — the label has room for a few short words.
function firstName(name: string | null | undefined) {
  return name?.trim().split(/\s+/)[0] || null;
}

// "Tested Amira · Checked Grace" (or just "Tested Amira" until it's checked).
export function peopleLine(testerName: string | null, checkerName: string | null) {
  const tester = firstName(testerName);
  const checker = firstName(checkerName);
  return [tester && `Tested ${tester}`, checker && `Checked ${checker}`].filter(Boolean).join(" · ");
}

// One item's label, ready to print. Used right after testing (Tester) and when
// a label is reprinted or replaced after a regrade (Amazon, Repair, Inventory).
export async function LabelScreen({
  unitId,
  heading,
  back,
}: {
  unitId: string;
  heading: string;
  back: { href: string; label: string };
}) {
  const supabase = await createClient();

  const { data: unit } = await supabase
    .from("units")
    .select(
      `id, serial_number, note, tester_id,
       sku_lines ( code, grades ( code ), model_variants ( color, models ( name, brands ( name ) ) ) )`
    )
    .eq("id", unitId)
    .single();

  if (!unit) notFound();

  const skuLine = unit.sku_lines as unknown as {
    code: string;
    grades: { code: string };
    model_variants: { color: string; models: { name: string; brands: { name: string } } };
  };

  // Who checked it (the Amazon lister). Asked separately so labels still print
  // before migration_17 adds the column.
  const { data: checked } = await supabase.from("units").select("checked_by").eq("id", unitId).maybeSingle();
  const checkedBy = (checked as { checked_by: string | null } | null)?.checked_by ?? null;

  // Staff names aren't readable by everyone, so look them up on the server.
  const ids = [unit.tester_id, checkedBy].filter((id): id is string => Boolean(id));
  const { data: people } = ids.length
    ? await createAdminClient().from("profiles").select("id, full_name").in("id", ids)
    : { data: [] as { id: string; full_name: string }[] };
  const nameOf = (id: string | null) => (id ? (people ?? []).find((p) => p.id === id)?.full_name ?? null : null);
  const testerName = nameOf(unit.tester_id);
  const checkerName = nameOf(checkedBy);

  const brandName = skuLine.model_variants.models.brands.name;
  const modelName = skuLine.model_variants.models.name;
  const color = skuLine.model_variants.color;
  const gradeCode = skuLine.grades.code;
  // Colour gets its own line — appended to the model name it wrapped off the
  // end of the label and never printed.
  const labelLine1 = modelName;
  const labelLine2 = color;
  const labelLine3 = `Grade ${gradeCode}`;
  const labelLine4 = peopleLine(testerName, checkerName);

  // Each unit gets its own QR — this is the ID a dispatcher/checker scan resolves
  // straight to this exact physical item, no manual matching needed.
  const qrDataUrl = await QRCode.toDataURL(unit.id, { margin: 1, width: 320 });

  return (
    <div className="min-h-dvh px-4 py-8 print:min-h-0 print:bg-white print:p-0">
      <div className="mx-auto max-w-sm print:hidden">
        <div className="flex items-center gap-2 text-success">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0">
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-sm font-medium">{heading}</p>
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          {brandName} {modelName} {color} — Grade {gradeCode}
          {unit.serial_number ? `, serial ${unit.serial_number}` : ""}
          {unit.note ? `, note: ${unit.note}` : ""}
        </p>
        {(testerName || checkerName) && (
          <p className="mt-0.5 text-xs text-fg-subtle">
            {testerName && `Tested by ${testerName}`}
            {testerName && checkerName && " · "}
            {checkerName && `Checked by ${checkerName}`}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
          <PrintActions back={back} />
          <DirectPrintButton
            unitId={unit.id}
            brandName={brandName}
            labelLine1={labelLine1}
            labelLine2={labelLine2}
            labelLine3={labelLine3}
            labelLine4={labelLine4}
            serialNumber={unit.serial_number ?? ""}
          />
        </div>
      </div>

      <div className="mt-6 print:mt-0">
        <PrintableLabel
          qrDataUrl={qrDataUrl}
          brandName={brandName}
          labelLine1={labelLine1}
          labelLine2={labelLine2}
          labelLine3={labelLine3}
          labelLine4={labelLine4}
          serialNumber={unit.serial_number ?? ""}
        />
      </div>
    </div>
  );
}
