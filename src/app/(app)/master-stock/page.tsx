import { listMasterStock } from "./actions";
import { MasterStockScreen } from "./master-stock-screen";

export default async function MasterStockPage() {
  const result = await listMasterStock("todo");
  return <MasterStockScreen initial={result} />;
}
