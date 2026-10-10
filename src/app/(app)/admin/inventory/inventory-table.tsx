"use client";

import { useMemo, useState } from "react";
import { Dialog, VisuallyHidden } from "radix-ui";
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
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
const PAGE_SIZES = [20, 50, 100, 200] as const;

function rowName(row: InventoryRow) {
  return `${row.brand} ${row.model} · ${row.color}`;
}

function totalOf(row: InventoryRow) {
  return Object.values(row.quantities).reduce((sum, qty) => sum + qty, 0);
}

export function InventoryTable({ initialRows, grades }: { initialRows: InventoryData["rows"]; grades: string[] }) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(50);
  const [page, setPage] = useState(0);
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
  // Every one of these also resets to page 1 — narrowing the result set can
  // easily leave the current page past what's left, showing an empty page
  // the person would otherwise have to notice and back out of.
  const patchFilters = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(0);
  };
  const updateQuery = (next: string) => {
    setQuery(next);
    setPage(0);
  };
  const clearSearch = () => {
    setQuery("");
    setFilters(NO_FILTERS);
    setPage(0);
  };
  const changePageSize = (size: (typeof PAGE_SIZES)[number]) => {
    setPageSize(size);
    setPage(0);
  };

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

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paginated = useMemo(
    () => filtered.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [filtered, safePage, pageSize]
  );
  const rangeStart = filtered.length === 0 ? 0 : safePage * pageSize + 1;
  const rangeEnd = Math.min(filtered.length, safePage * pageSize + pageSize);

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
      <div className="flex flex-wrap items-center gap-2">
        {/* Desktop: inline search, kept small — this used to be a full-width
            bar plus a whole second row of filters, eating far more vertical
            space than a filter bar needs. */}
        <div className="hidden sm:block sm:w-52">
          <Input
            type="text"
            placeholder="Search…"
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            className="min-h-9 py-1 text-sm"
          />
        </div>

        {/* Desktop: filters inline, same compact height as the search box. */}
        <div className="hidden flex-wrap items-center gap-2 sm:flex" role="group" aria-label="Filters">
          <div className="w-32">
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
          <div className="w-32">
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
          <div className="w-36">
            <Select
              aria-label="Filter by grade"
              value={filters.grade}
              onChange={(e) => patchFilters({ grade: e.target.value })}
              className="min-h-9 py-1 text-sm"
            >
              <option value="">Any grade</option>
              {grades.map((grade) => (
                <option key={grade} value={grade}>
                  Grade {grade} in stock
                </option>
              ))}
            </Select>
          </div>
          <div className="w-32">
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
          <div className="w-36">
            <Select
              aria-label="Filter by ASIN"
              value={filters.asin}
              onChange={(e) => patchFilters({ asin: e.target.value as AsinFilter })}
              className="min-h-9 py-1 text-sm"
            >
              <option value="all">Any ASIN status</option>
              <option value="has">Has ASIN</option>
              <option value="missing">Missing ({missingCount})</option>
            </Select>
          </div>
          {activeFilters > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setFilters(NO_FILTERS);
                setPage(0);
              }}
            >
              <X aria-hidden="true" />
              Clear ({activeFilters})
            </Button>
          )}
        </div>

        {/* Mobile: one button instead of a full search bar plus five select
            boxes stacked down the page — tapping it opens all of that in a
            sheet instead. */}
        <Dialog.Root open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
          <Dialog.Trigger asChild>
            <Button type="button" variant="secondary" size="sm" className="sm:hidden">
              <SlidersHorizontal aria-hidden="true" />
              Search &amp; filter
              {query.trim() || activeFilters > 0 ? (
                <span className="flex size-4.5 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-white">
                  {(query.trim() ? 1 : 0) + activeFilters}
                </span>
              ) : null}
            </Button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
            <Dialog.Content
              aria-describedby={undefined}
              className="glass-strong fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-b-none rounded-t-3xl border-b-0 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom"
            >
              <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line" />
              <VisuallyHidden.Root>
                <Dialog.Title>Search &amp; filter inventory</Dialog.Title>
              </VisuallyHidden.Root>

              <div className="space-y-4">
                <Field label="Search">
                  <Input
                    type="text"
                    autoFocus
                    placeholder="Brand, model, color or ASIN…"
                    value={query}
                    onChange={(e) => updateQuery(e.target.value)}
                  />
                </Field>
                <Field label="Brand">
                  <Select value={filters.brand} onChange={(e) => patchFilters({ brand: e.target.value })}>
                    <option value="">All brands</option>
                    {brandOptions.map((brand) => (
                      <option key={brand} value={brand}>
                        {brand}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Color">
                  <Select value={filters.color} onChange={(e) => patchFilters({ color: e.target.value })}>
                    <option value="">All colors</option>
                    {colorOptions.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Grade">
                  <Select value={filters.grade} onChange={(e) => patchFilters({ grade: e.target.value })}>
                    <option value="">Any grade</option>
                    {grades.map((grade) => (
                      <option key={grade} value={grade}>
                        Has grade {grade} in stock
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Stock">
                  <Select
                    value={filters.stock}
                    onChange={(e) => patchFilters({ stock: e.target.value as StockFilter })}
                  >
                    <option value="all">Any stock</option>
                    <option value="in">In stock</option>
                    <option value="out">Out of stock</option>
                  </Select>
                </Field>
                <Field label="ASIN status">
                  <Select value={filters.asin} onChange={(e) => patchFilters({ asin: e.target.value as AsinFilter })}>
                    <option value="all">Any ASIN status</option>
                    <option value="has">Has ASIN</option>
                    <option value="missing">Missing ASIN ({missingCount})</option>
                  </Select>
                </Field>

                <div className="flex gap-2 pt-1">
                  {(query.trim() || activeFilters > 0) && (
                    <Button type="button" variant="ghost" onClick={clearSearch}>
                      <X aria-hidden="true" />
                      Clear all
                    </Button>
                  )}
                  <Button type="button" className="flex-1" onClick={() => setFilterSheetOpen(false)}>
                    <Search aria-hidden="true" />
                    Show results
                  </Button>
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <div className="ml-auto flex items-center gap-2">
          <p className="text-xs text-fg-muted sm:text-sm">
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
            <span className="hidden sm:inline">Empty inventory</span>
          </Button>
        </div>
      </div>

      {notice && <Message variant="success">{notice}</Message>}

      <Card className="overflow-hidden">
        {/* max-h + overflow-y-auto only kicks in once the rows actually
            don't fit — if a page of results is short, this box just shrinks
            to its content and the page scrolls normally instead. */}
        <div className="max-h-[65dvh] overflow-auto">
          <table className="w-full min-w-180 text-sm">
            <thead className="sticky top-0 z-10 border-b border-line-soft bg-field text-left text-xs uppercase tracking-wider text-fg-subtle">
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
              {paginated.map((row) => (
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

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <span>
              {rangeStart}–{rangeEnd} of {filtered.length}
            </span>
            <div className="w-24">
              <Select
                aria-label="Rows per page"
                value={pageSize}
                onChange={(e) => changePageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])}
                className="min-h-8 py-1 text-sm"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} / page
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft aria-hidden="true" />
                Prev
              </Button>
              <p className="text-sm text-fg-muted tabular-nums">
                Page {safePage + 1} of {pageCount}
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                Next
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      )}

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
