import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { toCsv } from "@/lib/csv";
import { fetchAllPages } from "@/lib/fetch-all-pages";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 403 });

  const result = await fetchAllPages(async (from, to) =>
    admin.supabase
      .from("units")
      .select(
        `serial_number, note, status, tested_at, picked_at,
         tester:profiles!units_tester_id_fkey ( full_name ),
         picker:profiles!units_picked_by_fkey ( full_name ),
         sku_lines ( code, grades ( code ), model_variants ( color, models ( name, brands ( name ) ) ) )`
      )
      .order("tested_at", { ascending: false })
      .order("id")
      .range(from, to)
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  const rows = result.rows.map((u) => {
    const skuLine = u.sku_lines as unknown as {
      code: string;
      grades: { code: string };
      model_variants: { color: string; models: { name: string; brands: { name: string } } };
    };
    const tester = u.tester as unknown as { full_name: string } | null;
    const picker = u.picker as unknown as { full_name: string } | null;

    return [
      skuLine.model_variants.models.brands.name,
      skuLine.model_variants.models.name,
      skuLine.model_variants.color,
      skuLine.grades.code,
      skuLine.code,
      u.serial_number,
      u.note ?? "",
      u.status,
      tester?.full_name ?? "",
      u.tested_at,
      picker?.full_name ?? "",
      u.picked_at ?? "",
    ];
  });

  const csv = toCsv(
    [
      "Brand",
      "Model",
      "Color",
      "Grade",
      "SKU code",
      "Serial number",
      "Note",
      "Status",
      "Tested by",
      "Tested at",
      "Picked by",
      "Picked at",
    ],
    rows
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="units-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
