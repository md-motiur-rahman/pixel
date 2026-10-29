"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, VisuallyHidden } from "radix-ui";
import { ChevronLeft, ChevronRight, Eraser, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Button, Card, Field, Input, Message, Select } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ConfirmPasswordField } from "@/components/confirm-password-field";
import { ColorPill } from "@/components/color-pill";
import { CAMERA_COLORS, findColor } from "@/lib/colors";
import { cn } from "@/lib/cn";
import { deleteInventoryEntry, emptyInventory, zeroInventory, type InventoryData, type InventoryRow } from "./actions";
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
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(50);
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [asinRow, setAsinRow] = useState<InventoryRow | null>(null);
  const [emptying, setEmptying] = useState(false);
  const [zeroing, setZeroing] = useState(false);
  const [emptyPassword, setEmptyPassword] = useState("");
  const [emptyBusy, setEmptyBusy] = useState(false);
  const [emptyError, setEmptyError] = useState<string | null>(null);
  // Deleting one model + colour entered by mistake (password required).
  const [deletingRow, setDeletingRow] = useState<InventoryRow | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
  // While a password dialog is open nobody is typing in the search box — but
  // Chrome's password manager may drop the saved email into it, which filtered the
  // whole table down to "No matches" until a reload. Ignore any change then.
  const passwordDialogOpen = emptying || zeroing || deletingRow !== null;
  const updateQuery = (next: string) => {
    if (passwordDialogOpen) return;
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

  async function handleZero() {
    setEmptyBusy(true);
    setEmptyError(null);
    try {
      const result = await zeroInventory(emptyPassword);
      if (!result.ok) {
        setEmptyError(result.error);
        return;
      }
      setNotice(`All stock zeroed — ${result.lines} line${result.lines === 1 ? "" : "s"} set to 0. No camera records were deleted.`);
      setZeroing(false);
      setEmptyPassword("");
      // Re-read the table so the new (zero) quantities show without a manual reload.
      router.refresh();
    } catch {
      setEmptyError("Could not zero the stock — check your connection and try again.");
    } finally {
      setEmptyBusy(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paginated = useMemo(
    () => filtered.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [filtered, safePage, pageSize]
  );
  const rangeStart = filtered.length === 0 ? 0 : safePage * pageSize + 1;
  const rangeEnd = Math.min(filtered.length, safePage * pageSize + pageSize);

  async function handleDelete() {
    if (!deletingRow) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const result = await deleteInventoryEntry(deletingRow.variantId, deletePassword);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      const removed = [
        `${result.cameras} camera record${result.cameras === 1 ? "" : "s"}`,
        result.modelRemoved ? "the model" : null,
        result.brandRemoved ? "the brand" : null,
      ].filter(Boolean);
      setNotice(`Deleted ${rowName(deletingRow)} — removed ${removed.join(", ")}.`);
      setDeletingRow(null);
      setDeletePassword("");
      router.refresh();
    } catch {
      setDeleteError("Could not delete — check your connection and try again.");
    } finally {
      setDeleteBusy(false);
    }
  }

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
      router.refresh();
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
            type="search"
            name="inventory-search"
            autoComplete="off"
            aria-label="Search inventory"
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
                    type="search"
                    name="inventory-search"
                    autoComplete="off"
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
            variant="secondary"
            disabled={totalInStock === 0}
            onClick={() => {
              setEmptyPassword("");
              setEmptyError(null);
              setZeroing(true);
            }}
          >
            <Eraser aria-hidden="true" />
            Zero all stock
          </Button>
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
                <th className="w-12 px-2 py-2.5">
                  <span className="sr-only">Delete</span>
                </th>
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
                  <td className="px-2 py-2 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setNotice(null);
                        setDeletePassword("");
                        setDeleteError(null);
                        setDeletingRow(row);
                      }}
                      aria-label={`Delete ${rowName(row)}`}
                      title="Delete this entry"
                      className="min-h-8 px-2 text-fg-subtle hover:text-danger"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5 + grades.length} className="px-3.5 py-8 text-center text-fg-subtle">
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
        <ConfirmPasswordField
          value={emptyPassword}
          onChange={setEmptyPassword}
          onEnter={() => {
            if (emptyPassword && !emptyBusy) void handleEmpty();
          }}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={zeroing}
        onOpenChange={(open) => {
          if (!open) {
            setZeroing(false);
            setEmptyPassword("");
            setEmptyError(null);
          }
        }}
        title="Set all stock to zero?"
        description={
          <>
            <p className="font-medium text-fg">
              Every model&rsquo;s quantity ({totalInStock} camera{totalInStock === 1 ? "" : "s"} in total) becomes 0.
            </p>
            <p>
              No camera records are deleted — they stay in the system, so each can still be looked up, scanned and
              picked. New cameras tested from now on count up from zero. A line-by-line record is added to the
              adjustment log.
            </p>
          </>
        }
        confirmLabel="Zero all stock"
        destructive
        busy={emptyBusy}
        error={emptyError}
        onConfirm={() => {
          if (emptyPassword) void handleZero();
        }}
      >
        <ConfirmPasswordField
          value={emptyPassword}
          onChange={setEmptyPassword}
          onEnter={() => {
            if (emptyPassword && !emptyBusy) void handleZero();
          }}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={deletingRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingRow(null);
            setDeletePassword("");
            setDeleteError(null);
          }
        }}
        title="Delete this entry?"
        description={
          deletingRow && (
            <>
              <p className="font-medium text-danger">
                {rowName(deletingRow)} — all grades, with its {totalOf(deletingRow)} in-stock camera
                {totalOf(deletingRow) === 1 ? "" : "s"}. This can&rsquo;t be undone.
              </p>
              <p>
                Use this for something added by mistake. The model (and brand) are removed too if nothing else uses
                them. If any of its cameras were already picked or shipped, it won&rsquo;t be deleted.
              </p>
            </>
          )
        }
        confirmLabel="Delete entry"
        destructive
        busy={deleteBusy}
        error={deleteError}
        onConfirm={() => {
          if (deletePassword) void handleDelete();
        }}
      >
        <ConfirmPasswordField
          value={deletePassword}
          onChange={setDeletePassword}
          onEnter={() => {
            if (deletePassword && !deleteBusy) void handleDelete();
          }}
        />
      </ConfirmDialog>
    </div>
  );
}
