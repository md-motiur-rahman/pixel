import { listInventory } from "./actions";
import { InventoryTable } from "./inventory-table";

export default async function InventoryPage() {
  const rows = await listInventory();
  return <InventoryTable initialRows={rows} />;
}
