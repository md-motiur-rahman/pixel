import { listInventory } from "./actions";
import { InventoryTable } from "./inventory-table";
import { SerialLookup } from "./serial-lookup";

export default async function InventoryPage() {
  const { rows, grades } = await listInventory();
  return (
    <div className="space-y-4">
      <div className="mx-auto w-full max-w-3xl">
        <SerialLookup />
      </div>
      <InventoryTable initialRows={rows} grades={grades} />
    </div>
  );
}
