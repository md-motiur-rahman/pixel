import { Download } from "lucide-react";
import { Button, Card } from "@/components/ui";

export default function ExportPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Card className="p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-fg">Inventory summary</h2>
        <p className="mt-1 text-sm text-fg-muted">
          One row per brand/model/color/grade, with the current in-stock quantity and its ASINs.
        </p>
        <Button asChild className="mt-4">
          <a href="/api/export/inventory">
            <Download aria-hidden="true" />
            Download inventory CSV
          </a>
        </Button>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-fg">All units</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Every item ever tested, with its serial, status, tester, and pick history.
        </p>
        <Button asChild className="mt-4">
          <a href="/api/export/units">
            <Download aria-hidden="true" />
            Download units CSV
          </a>
        </Button>
      </Card>
    </div>
  );
}
