import { LabelScreen } from "../../tester/print/[unitId]/label-screen";

// Where the "back" button goes, by the page that sent someone here. A fixed list,
// so the link can never point anywhere else.
const BACK: Record<string, { href: string; label: string }> = {
  amazon: { href: "/amazon", label: "Back to Amazon listing" },
  repair: { href: "/repair", label: "Back to Repair" },
  clearance: { href: "/clearance", label: "Back to Clearance" },
  inventory: { href: "/admin/inventory", label: "Back to Inventory" },
};

// A label anyone signed in can print — the Amazon lister after a regrade, repair
// staff after a repair, an admin reprinting one.
export default async function LabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitId: string }>;
  searchParams: Promise<{ from?: string; regraded?: string }>;
}) {
  const [{ unitId }, { from, regraded }] = await Promise.all([params, searchParams]);
  const back = (from && BACK[from]) || { href: "/", label: "Done" };
  return (
    <LabelScreen
      unitId={unitId}
      heading={regraded ? `Regraded to ${regraded} — print the new label` : "Label ready"}
      back={back}
    />
  );
}
