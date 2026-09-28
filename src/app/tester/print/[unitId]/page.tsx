import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { PrintActions } from "./print-actions";
import { PrintableLabel } from "./printable-label";

export default async function PrintLabelPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  const supabase = await createClient();

  const { data: unit } = await supabase
    .from("units")
    .select(
      `id, serial_number, note,
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

  const brandName = skuLine.model_variants.models.brands.name;
  const modelName = skuLine.model_variants.models.name;
  const color = skuLine.model_variants.color;
  const gradeCode = skuLine.grades.code;
  const labelLine1 = `${modelName} ${color}`.trim();
  const labelLine2 = `Grade ${gradeCode}`;

  // Each unit gets its own QR — this is the ID a dispatcher/checker scan resolves
  // straight to this exact physical camera, no manual matching needed.
  const qrDataUrl = await QRCode.toDataURL(unit.id, { margin: 1, width: 320 });

  return (
    <div className="min-h-dvh bg-neutral-50 px-4 py-8 print:min-h-0 print:bg-white print:p-0">
      <div className="mx-auto max-w-sm print:hidden">
        <div className="flex items-center gap-2 text-emerald-700">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0">
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-sm font-medium">Camera saved</p>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {brandName} {modelName} {color} — Grade {gradeCode}, serial {unit.serial_number}
          {unit.note ? `, note: ${unit.note}` : ""}
        </p>
        <div className="mt-4">
          <PrintActions />
        </div>
      </div>

      <div className="mt-6 print:mt-0">
        <PrintableLabel
          qrDataUrl={qrDataUrl}
          brandName={brandName}
          labelLine1={labelLine1}
          labelLine2={labelLine2}
          serialNumber={unit.serial_number}
        />
      </div>
    </div>
  );
}
