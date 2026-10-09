import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { toCsv } from "@/lib/csv";
import { fetchAllPages } from "@/lib/fetch-all-pages";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 403 });

  const result = await fetchAllPages(async (from, to) =>
    admin.supabase
      .from("sku_lines")
      .select(
        "code, quantity, grades ( code ), model_variants ( color, models ( name, brands ( name ) ), variant_asins ( asin, position ) )"
      )
      .order("code")
      .range(from, to)
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  const rows = result.rows.map((sl) => {
    const variant = sl.model_variants as unknown as {
      color: string;
      models: { name: string; brands: { name: string } };
      variant_asins: { asin: string; position: number }[] | null;
    };
    const grade = sl.grades as unknown as { code: string };
    const asins = (variant.variant_asins ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((a) => a.asin);
    return [
      variant.models.brands.name,
      variant.models.name,
      variant.color,
      grade.code,
      sl.quantity,
      sl.code,
      asins[0] ?? "",
      asins[1] ?? "",
      asins[2] ?? "",
    ];
  });

  const csv = toCsv(["Brand", "Model", "Color", "Grade", "Quantity", "SKU code", "ASIN", "ASIN 2", "ASIN 3"], rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inventory-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
