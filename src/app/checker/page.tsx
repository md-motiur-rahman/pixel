import { CountSession } from "./count-session";
import { getActiveStockCount, getTally } from "./actions";

export default async function CheckerPage() {
  const active = await getActiveStockCount();
  const tallyResult = active ? await getTally(active.stockCountId) : null;
  const initialTally = tallyResult?.ok ? tallyResult.tally : [];

  return <CountSession initialStockCountId={active?.stockCountId ?? null} initialTally={initialTally} />;
}
