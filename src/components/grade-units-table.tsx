"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Printer } from "lucide-react";
import { Button, Card, Input, Message } from "@/components/ui";
import { ColorPill } from "@/components/color-pill";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cn } from "@/lib/cn";
import type { GradeUnit } from "@/lib/grade-units";
import type { GradeOption } from "@/app/(app)/amazon/actions";
import { finishRepair } from "@/app/(app)/repair/actions";

// "Repaired" on one item: pick the grade it is now, confirm, then print its new label.
function RepairDone({ unit, grades }: { unit: GradeUnit; grades: GradeOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [gradeId, setGradeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = grades.find((g) => g.id === gradeId);

  async function submit() {
    if (!gradeId) {
      setError("Pick the grade the item is now.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await finishRepair(unit.id, gradeId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/label/${unit.id}?from=repair&regraded=${encodeURIComponent(result.grade)}`);
    } catch {
      setError("Could not save — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => {
          setGradeId("");
          setError(null);
          setOpen(true);
        }}
      >
        <CheckCircle2 aria-hidden="true" />
        Repaired
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Repair finished — what grade is it now?"
        description={
          <>
            <p>
              {unit.brand} {unit.model} ({unit.color})
              {unit.serialNumber ? `, serial ${unit.serialNumber}` : ""}.
            </p>
            <div role="radiogroup" aria-label="New grade" className="grid grid-cols-2 gap-2 pt-1">
              {grades.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={gradeId === g.id}
                  onClick={() => setGradeId(g.id)}
                  className={cn(
                    "min-h-11 rounded-xl px-3 text-left text-sm font-medium ring-1 outline-none transition-colors ring-inset focus-visible:ring-2 focus-visible:ring-accent/60",
                    gradeId === g.id ? "bg-accent/12 text-accent ring-accent/40" : "text-fg ring-line hover:bg-glass-hover"
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
            {chosen && (
              <p className="text-xs">
                {chosen.inInventory
                  ? "It goes back into the inventory (its stock count goes up) and onto the Amazon list."
                  : "It moves to Clearance."}{" "}
                Next you&rsquo;ll print its new label.
              </p>
            )}
          </>
        }
        confirmLabel="Save & print label"
        busy={busy}
        error={error}
        onConfirm={() => void submit()}
      />
    </>
  );
}

// The Repair and Clearance pages: every in-stock item of that grade. On Repair,
// "Repaired" grades a fixed item and moves it back into the inventory.
export function GradeUnitsTable({
  title,
  description,
  gradeLabel,
  labelFrom,
  repairGrades,
  result,
}: {
  title: string;
  description: string;
  gradeLabel: string;
  /** Where the label page's back button returns to. */
  labelFrom: "repair" | "clearance";
  /** Repair page only: the grades a repaired item can be given. */
  repairGrades?: GradeOption[];
  result: { ok: true; units: GradeUnit[] } | { ok: false; error: string };
}) {
  const [query, setQuery] = useState("");

  const units = useMemo(() => {
    if (!result.ok) return [];
    const q = query.trim().toLowerCase();
    if (!q) return result.units;
    return result.units.filter((u) =>
      `${u.brand} ${u.model} ${u.color} ${u.serialNumber ?? ""} ${u.note ?? ""}`.toLowerCase().includes(q)
    );
  }, [result, query]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-fg">{title}</h1>
        <p className="mt-0.5 text-sm text-fg-muted">{description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-64">
          <Input
            type="search"
            name={`${gradeLabel}-search`}
            autoComplete="off"
            aria-label={`Search ${title}`}
            placeholder="Search brand, model, colour, serial…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-9 py-1 text-sm"
          />
        </div>
        {result.ok && (
          <p className="text-sm text-fg-muted">
            {units.length} item{units.length === 1 ? "" : "s"}
            {query ? ` of ${result.units.length}` : ""} · {gradeLabel}
          </p>
        )}
      </div>

      {!result.ok && <Message variant="error">{result.error}</Message>}

      {result.ok && (
        <Card className="overflow-hidden">
          <div className="max-h-[70dvh] overflow-auto">
            <table className="w-full min-w-180 text-sm">
              <thead className="sticky top-0 z-10 border-b border-line-soft bg-field text-left text-xs uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th className="px-3.5 py-2.5 font-medium">Brand</th>
                  <th className="px-3.5 py-2.5 font-medium">Model</th>
                  <th className="px-3.5 py-2.5 font-medium">Color</th>
                  <th className="px-3.5 py-2.5 font-medium">Serial</th>
                  <th className="px-3.5 py-2.5 font-medium">Note</th>
                  <th className="px-3.5 py-2.5 font-medium">Tested</th>
                  {repairGrades && (
                    <th className="px-2 py-2.5">
                      <span className="sr-only">Repair</span>
                    </th>
                  )}
                  <th className="w-12 px-2 py-2.5">
                    <span className="sr-only">Label</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {units.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-glass-soft">
                    <td className="whitespace-nowrap px-3.5 py-2.5">{u.brand}</td>
                    <td className="whitespace-nowrap px-3.5 py-2.5">{u.model}</td>
                    <td className="whitespace-nowrap px-3.5 py-2.5">
                      <ColorPill color={u.color} />
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-xs">
                      {u.serialNumber ?? <span className="text-fg-subtle">—</span>}
                    </td>
                    <td className="px-3.5 py-2.5 text-fg-muted">{u.note ?? ""}</td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-fg-muted" suppressHydrationWarning>
                      {new Date(u.testedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      {u.testerName ? ` · ${u.testerName}` : ""}
                    </td>
                    {repairGrades && (
                      <td className="px-2 py-2 text-right">
                        <RepairDone unit={u} grades={repairGrades} />
                      </td>
                    )}
                    <td className="px-2 py-2 text-right">
                      <Link
                        href={`/label/${u.id}?from=${labelFrom}`}
                        title="Reprint label"
                        aria-label={`Reprint label for ${u.brand} ${u.model}`}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-glass-hover hover:text-fg"
                      >
                        <Printer aria-hidden="true" className="size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {units.length === 0 && (
                  <tr>
                    <td colSpan={repairGrades ? 8 : 7} className="px-3.5 py-8 text-center text-fg-subtle">
                      {query ? "No matches." : `No items in ${title.toLowerCase()} right now.`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
