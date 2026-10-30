import { listInventory } from "./actions";
import { InventoryTable } from "./inventory-table";
import { SerialLookup } from "./serial-lookup";

export default async function InventoryPage() {
  const { rows, grades } = await listInventory();
  return (
    // On desktop the page is exactly one screen tall: the table fills what's
    // left and scrolls inside itself, so the filters and paging stay in view.
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-4rem)] lg:min-h-[36rem]">
      {/* max-w-3xl suited the old full-width card; on desktop this is now
          just a small trigger button, so it can sit at the natural left
          edge like everything else on the page. */}
      <SerialLookup />
      <InventoryTable initialRows={rows} grades={grades} />
    </div>
  );
}
