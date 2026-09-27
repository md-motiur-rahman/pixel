import { Card } from "@/components/ui";

const LINK_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-500";

export default function ExportPage() {
  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-neutral-900">Inventory summary</h2>
        <p className="mt-1 text-sm text-neutral-500">
          One row per brand/model/color/grade, with the current in-stock quantity.
        </p>
        <a href="/api/export/inventory" className={`mt-4 ${LINK_CLASS}`}>
          Download inventory CSV
        </a>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-neutral-900">All units</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Every camera ever tested, with its serial, status, tester, and pick history.
        </p>
        <a href="/api/export/units" className={`mt-4 ${LINK_CLASS}`}>
          Download units CSV
        </a>
      </Card>
    </div>
  );
}
