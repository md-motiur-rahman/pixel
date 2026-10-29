"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { Card, Input, Message } from "@/components/ui";
import { ColorPill } from "@/components/color-pill";
import type { GradeUnit } from "@/lib/grade-units";

// The Repair and Clearance pages: every in-stock camera of that grade. To move a
// camera out (e.g. repaired → Grade A), regrade it in Tester → Find a saved camera.
export function GradeUnitsTable({
  title,
  description,
  gradeLabel,
  result,
}: {
  title: string;
  description: string;
  gradeLabel: string;
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
            {units.length} camera{units.length === 1 ? "" : "s"}
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
                    <td className="px-2 py-2 text-right">
                      <Link
                        href={`/tester/print/${u.id}`}
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
                    <td colSpan={7} className="px-3.5 py-8 text-center text-fg-subtle">
                      {query ? "No matches." : `No cameras in ${title.toLowerCase()} right now.`}
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
