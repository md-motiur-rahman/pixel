"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Button, Card, Field, Input, Message, Select } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ColorPill } from "@/components/color-pill";
import { CAMERA_COLORS, findColor } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { emptyInventory, type InventoryData, type InventoryRow } from "./actions";
import { AsinDialog } from "./asin-dialog";

type StockFilter = "all" | "in" | "out";
type AsinFilter = "all" | "has" | "missing";
type Filters = { brand: string; color: string; grade: string; stock: StockFilter; asin: AsinFilter };

const NO_FILTERS: Filters = { brand: "", color: "", grade: "", stock: "all", asin: "all" };

function rowName(row: InventoryRow) {
  return `${row.brand} ${row.model} · ${row.color}`;
}

function totalOf(row: InventoryRow) {
  return Object.values(row.quantities).reduce((sum, qty) => sum + qty, 0);
}

export function InventoryTable({ initialRows, grades }: { initialRows: InventoryData["rows"]; grades: string[] }) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [notice, setNotice] = useState<string | null>(null);
  const [asinRow, setAsinRow] = useState<InventoryRow | null>(null);
  const [emptying, setEmptying] = useState(false);
  const [emptyPassword, setEmptyPassword] = useState("");
  const [emptyBusy, setEmptyBusy] = useState(false);
  const [emptyError, setEmptyError] = useState<string | null>(null);

  const missingCount = useMemo(() => initialRows.filter((row) => row.asins.length === 0).length, [initialRows]);
  const brandOptions = useMemo(
    () => [...new Set(initialRows.map((row) => row.brand))].sort((a, b) => a.localeCompare(b)),
    [initialRows]
  );
  // Colours actually in the inventory, in the picker's order (any older, free-typed ones after).
  const colorOptions = useMemo(() => {
    const present = new Set(initialRows.map((row) => row.color));
    const preset = CAMERA_COLORS.map((c) => c.name).filter((name) => present.has(name));
    const other = [...present].filter((name) => !findColor(name)).sort((a, b) => a.localeCompare(b));
    return [...preset, ...other];
  }, [initialRows]);
  const totalInStock = useMemo(() => initialRows.reduce((sum, row) => sum + totalOf(row), 0), [initialRows]);
  const activeFilters =
    (filters.brand ? 1 : 0) + (filters.color ? 1 : 0) + (filters.grade ? 1 : 0) + (filters.stock !== "all" ? 1 : 0) + (filters.asin !== "all" ? 1 : 0);
  const patchFilters = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialRows.filter((row) => {
      if (filters.brand && row.brand !== filters.brand) return false;
      if (filters.color && row.color !== filters.color) return false;
      // "Grade X": the row has grade X in stock.
      if (filters.grade && (row.quantities[filters.grade] ?? 0) <= 0) return false;
      const total = totalOf(row);
      if (filters.stock === "in" && total <= 0) return false;
      if (filters.stock === "out" && total > 0) return false;
      if (filters.asin === "has" && row.asins.length === 0) return false;
      if (filters.asin === "missing" && row.asins.length > 0) return false;
      if (!q) return true;
      return `${row.brand} ${row.model} ${row.color} ${row.asins.join(" ")}`.toLowerCase().includes(q);
    });
  }, [initialRows, query, filters]);

  // With a grade filter on, count just that grade — otherwise every grade of the shown rows.
  const shownUnits = useMemo(
    () =>
      filtered.reduce((sum, row) => sum + (filters.grade ? (row.quantities[filters.grade] ?? 0) : totalOf(row)), 0),
    [filtered, filters.grade]
  );

  async function handleEmpty() {
    setEmptyBusy(true);
    setEmptyError(null);
    try {
      const result = await emptyInventory(emptyPassword);
      if (!result.ok) {
        setEmptyError(result.error);
        return;
      }
      setNotice(`Inventory emptied — ${result.deleted} camera${result.deleted === 1 ? "" : "s"} deleted.`);
      setEmptying(false);
      setEmptyPassword("");
    } catch {
      setEmptyError("Could not empty the inventory — check your connection and try again.");
    } finally {
      setEmptyBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          type="text"
          placeholder="Search brand, model, color or ASIN…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-sm"
        />
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <p className="text-sm text-fg-muted">
            {filtered.length} line{filtered.length === 1 ? "" : "s"} · {shownUnits} camera
            {shownUnits === 1 ? "" : "s"} in stock
          </p>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={totalInStock === 0}
            onClick={() => {
              setEmptyPassword("");
              setEmptyError(null);
              setEmptying(true);
            }}
          >
            <Trash2 aria-hidden="true" />
            Empty inventory
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        <div className="w-40">
          <Select
            aria-label="Filter by brand"
            value={filters.brand}
            onChange={(e) => patchFilters({ brand: e.target.value })}
            className="min-h-9 py-1 text-sm"
          >
            <option value="">All brands</option>
            {brandOptions.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select
            aria-label="Filter by color"
            value={filters.color}
            onChange={(e) => patchFilters({ color: e.target.value })}
            className="min-h-9 py-1 text-sm"
          >
            <option value="">All colors</option>
            {colorOptions.map((color) => (
              <option key={color} value={color}>
                {color}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select
            aria-label="Filter by grade"
            value={filters.grade}
            onChange={(e) => patchFilters({ grade: e.target.value })}
            className="min-h-9 py-1 text-sm"
          >
            <option value="">Any grade</option>
            {grades.map((grade) => (
              <option key={grade} value={grade}>
                Has grade {grade} in stock
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select
            aria-label="Filter by stock"
            value={filters.stock}
            onChange={(e) => patchFilters({ stock: e.target.value as StockFilter })}
            className="min-h-9 py-1 text-sm"
          >
            <option value="all">Any stock</option>
            <option value="in">In stock</option>
            <option value="out">Out of stock</option>
          </Select>
        </div>
        <div className="w-48">
          <Select
            aria-label="Filter by ASIN"
            value={filters.asin}
            onChange={(e) => patchFilters({ asin: e.target.value as AsinFilter })}
            className="min-h-9 py-1 text-sm"
          >
            <option value="all">Any ASIN status</option>
            <option value="has">Has ASIN</option>
            <option value="missing">Missing ASIN ({missingCount})</option>
          </Select>
        </div>
        {activeFilters > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setFilters(NO_FILTERS)}>
            <X aria-hidden="true" />
            Clear filters ({activeFilters})
          </Button>
        )}
      </div>

      {notice && <Message variant="success">{notice}</Message>}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 text-sm">
            <thead className="border-b border-line-soft bg-glass-soft text-left text-xs uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="px-3.5 py-2.5 font-medium">Brand</th>
                <th className="px-3.5 py-2.5 font-medium">Model</th>
                <th className="px-3.5 py-2.5 font-medium">Color</th>
                {grades.map((grade) => (
                  <th key={grade} className="w-20 px-3.5 py-2.5 text-right font-medium" title={`Grade ${grade} in stock`}>
                    {grade}
                  </th>
                ))}
                <th className="px-3.5 py-2.5 font-medium">ASIN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filtered.map((row) => (
                <tr key={row.variantId} className="transition-colors hover:bg-glass-soft">
                  <td className="whitespace-nowrap px-3.5 py-2.5">{row.brand}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">{row.model}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">
                    <ColorPill color={row.color} />
                  </td>
                  {grades.map((grade) => {
                    const qty = row.quantities[grade] ?? 0;
                    return (
                      <td
                        key={grade}
                        className={cn("px-3.5 py-2.5 text-right tabular-nums", qty > 0 ? "font-medium" : "text-fg-subtle")}
                      >
                        {qty > 0 ? qty : "–"}
                      </td>
                    );
                  })}
                  <td className="px-3.5 py-2">
                    {row.asins.length === 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setNotice(null);
                          setAsinRow(row);
                        }}
                        aria-label={`Add ASIN for ${rowName(row)}`}
                        className="min-h-8 border-warn-line px-2.5 text-warn"
                      >
                        <Plus aria-hidden="true" />
                        Add ASIN
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="flex flex-wrap gap-1">
                          {row.asins.map((asin, i) => (
                            <span
                              key={asin}
                              title={i === 0 ? "Main ASIN" : "Extra ASIN"}
                              className={cn(
                                "rounded-md border px-1.5 py-0.5 font-mono text-xs",
                                i === 0 ? "border-line bg-glass-soft text-fg" : "border-line-soft text-fg-muted"
                              )}
                            >
                              {asin}
                            </span>
                          ))}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setNotice(null);
                            setAsinRow(row);
                          }}
                          aria-label={`Edit ASINs for ${rowName(row)}`}
                          className="min-h-8 px-2"
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4 + grades.length} className="px-3.5 py-8 text-center text-fg-subtle">
                    {query || activeFilters > 0 ? "No matches." : "No inventory yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <AsinDialog
        row={asinRow}
        onClose={() => setAsinRow(null)}
        onSaved={(message) => {
          setNotice(message);
          setAsinRow(null);
        }}
      />

      <ConfirmDialog
        open={emptying}
        onOpenChange={(open) => {
          if (!open) {
            setEmptying(false);
            setEmptyPassword("");
            setEmptyError(null);
          }
        }}
        title="Empty the whole inventory?"
        description={
          <>
            <p className="font-medium text-danger">
              This permanently deletes all {totalInStock} in-stock camera{totalInStock === 1 ? "" : "s"}. It can&rsquo;t
              be undone.
            </p>
            <p>
              Their serial numbers become reusable. Picked and shipped history, the catalog and the ASINs are kept. A
              line-by-line record is added to the adjustment log.
            </p>
          </>
        }
        confirmLabel="Delete all cameras"
        destructive
        busy={emptyBusy}
        error={emptyError}
        onConfirm={() => {
          if (emptyPassword) void handleEmpty();
        }}
      >
        <Field label="Enter your password to confirm">
          <Input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={emptyPassword}
            onChange={(e) => setEmptyPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && emptyPassword && !emptyBusy) void handleEmpty();
            }}
          />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
