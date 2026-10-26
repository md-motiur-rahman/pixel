import { listInventory } from "./actions";
import { InventoryTable } from "./inventory-table";
import { SerialLookup } from "./serial-lookup";

export default async function InventoryPage() {
  const { rows, grades } = await listInventory();
  return (
    <div className="space-y-4">
      {/* max-w-3xl suited the old full-width card; on desktop this is now
          just a small trigger button, so it can sit at the natural left
          edge like everything else on the page. */}
      <SerialLookup />
      <InventoryTable initialRows={rows} grades={grades} />
    </div>
  );
}
