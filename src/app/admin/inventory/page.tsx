import { listInventory } from "./actions";
import { InventoryTable } from "./inventory-table";
import { SerialLookup } from "./serial-lookup";

export default async function InventoryPage() {
  const rows = await listInventory();
  return (
    <div className="space-y-4">
      <SerialLookup />
      <InventoryTable initialRows={rows} />
    </div>
  );
}
