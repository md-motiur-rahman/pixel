"use client";

import { useMemo, useState } from "react";
import { Card, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { InventoryRow } from "./actions";

export function InventoryTable({ initialRows }: { initialRows: InventoryRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialRows;
    return initialRows.filter((row) =>
      `${row.brand} ${row.model} ${row.color} ${row.grade}`.toLowerCase().includes(q)
    );
  }, [initialRows, query]);

  const totalUnits = useMemo(() => filtered.reduce((sum, row) => sum + row.quantity, 0), [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          type="text"
          placeholder="Search brand, model, color, or grade…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        <p className="text-sm text-neutral-500">
          {filtered.length} line{filtered.length === 1 ? "" : "s"} · {totalUnits} camera
          {totalUnits === 1 ? "" : "s"} in stock
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-140 text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-3.5 py-2.5 font-medium">Brand</th>
                <th className="px-3.5 py-2.5 font-medium">Model</th>
                <th className="px-3.5 py-2.5 font-medium">Color</th>
                <th className="px-3.5 py-2.5 font-medium">Grade</th>
                <th className="px-3.5 py-2.5 text-right font-medium">Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((row) => (
                <tr key={row.skuLineId} className={cn(row.quantity === 0 && "text-neutral-400")}>
                  <td className="whitespace-nowrap px-3.5 py-2.5">{row.brand}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">{row.model}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">{row.color}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">{row.grade}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-medium">{row.quantity}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3.5 py-8 text-center text-neutral-400">
                    {query ? "No matches." : "No inventory yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
