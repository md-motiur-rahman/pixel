"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Badge, Button, Card, Field, Input, Message } from "@/components/ui";
import { ColorPill } from "@/components/color-pill";
import { SerialInput } from "@/components/serial-input";
import { cn } from "@/lib/cn";
import {
  listMasterStock,
  saveMasterStockDetails,
  type MasterStockFilter,
  type MasterStockList,
  type MasterStockRow,
} from "./actions";

// How often the open page checks for newly picked cameras (it also checks the
// moment the tab comes back into view).
const POLL_MS = 8000;

const FILTERS: { value: MasterStockFilter; label: string }[] = [
  { value: "todo", label: "To price" },
  { value: "done", label: "Priced" },
  { value: "all", label: "All" },
];

function priceText(value: number | null) {
  return value === null ? "" : value.toFixed(2);
}

function pickedLabel(row: MasterStockRow) {
  const when = new Date(row.pickedAt).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return row.pickedByName ? `Picked ${when} by ${row.pickedByName}` : `Picked ${when}`;
}

function MasterStockItem({
  row,
  onSaved,
}: {
  row: MasterStockRow;
  onSaved: (unitId: string, saved: { sellingPrice: number | null; serialNumber: string | null }) => void;
}) {
  const [price, setPrice] = useState(priceText(row.sellingPrice));
  const [serial, setSerial] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // A serial already on the camera stays as it is; only a missing one can be filled in here.
  const hasSerial = row.serialNumber !== null;
  const priced = row.sellingPrice !== null;
  // Price and serial are both optional — Save is offered once either has something new.
  const priceChanged = price.trim() !== "" && price.trim() !== priceText(row.sellingPrice);
  const dirty = priceChanged || (!hasSerial && serial.trim() !== "");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setJustSaved(false);
    try {
      const result = await saveMasterStockDetails(row.unitId, price, serial);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPrice(priceText(result.sellingPrice));
      setSerial("");
      setJustSaved(true);
      onSaved(row.unitId, { sellingPrice: result.sellingPrice, serialNumber: result.serialNumber });
    } catch {
      setError("Could not save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li>
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">
              {row.brand} {row.model}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <ColorPill color={row.color} />
              <Badge>Grade {row.grade}</Badge>
              {priced ? <Badge tone="success">Priced</Badge> : <Badge tone="warning">To price</Badge>}
            </div>
          </div>
          <p className="text-xs text-fg-subtle" suppressHydrationWarning>
            {pickedLabel(row)}
          </p>
        </div>
        {row.note && <p className="mt-2 text-xs text-fg-muted">Note: {row.note}</p>}

        <form onSubmit={handleSave} className="mt-4 grid gap-3 sm:grid-cols-[1fr_11rem_auto] sm:items-end">
          {hasSerial ? (
            <div>
              <p className="mb-1.5 text-sm font-medium text-fg">Serial number</p>
              <p className="flex min-h-11 items-center font-mono text-sm text-fg">{row.serialNumber}</p>
            </div>
          ) : (
            <Field label="Serial number" hint="This camera has none yet — add it if you have it.">
              <SerialInput value={serial} onValueChange={setSerial} placeholder="Optional" />
            </Field>
          )}

          <Field label="Selling price (£)" hint="Optional — add it now or later.">
            <Input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 129.99"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setJustSaved(false);
              }}
            />
          </Field>

          <Button type="submit" disabled={saving || !dirty} className="w-full sm:w-auto">
            {saving ? "Saving…" : priced ? "Update" : "Save"}
          </Button>
        </form>

        {error && (
          <Message variant="error" className="mt-3">
            {error}
          </Message>
        )}
        {justSaved && !error && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-success">
            <Check aria-hidden="true" className="size-4" />
            Saved
          </p>
        )}
      </Card>
    </li>
  );
}

export function MasterStockScreen({ initial }: { initial: MasterStockList }) {
  const [filter, setFilter] = useState<MasterStockFilter>("todo");
  const [data, setData] = useState<MasterStockList>(initial);
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  // The timer below reads the current tab from here, so it never uses a stale one.
  const filterRef = useRef(filter);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  function load(next: MasterStockFilter) {
    setFilter(next);
    startTransition(async () => {
      try {
        setData(await listMasterStock(next));
      } catch {
        setData({ ok: false, error: "Could not load — check your connection and try again." });
      }
    });
  }

  // Picks show up here without a reload: the database adds a camera to master stock
  // the instant it's picked, and this re-reads the list on a timer and when the tab
  // is shown again. A failed check (e.g. a dropped connection) just keeps what's on
  // screen — it never replaces the list with an error.
  const refreshQuietly = useCallback(async () => {
    const requested = filterRef.current;
    try {
      const latest = await listMasterStock(requested);
      if (!latest.ok || filterRef.current !== requested) return;
      setData((current) => {
        if (!current.ok) return latest;
        // On "To price", a camera priced a moment ago is no longer in the server's
        // list. Keep it on screen (with its "Saved" tick) until the tab is changed,
        // rather than having it vanish under the person's cursor.
        const fresh = new Set(latest.rows.map((row) => row.unitId));
        const justPriced =
          requested === "todo" ? current.rows.filter((row) => row.sellingPrice !== null && !fresh.has(row.unitId)) : [];
        const rows = [...latest.rows, ...justPriced].sort((a, b) => b.pickedAt.localeCompare(a.pickedAt));
        return { ...latest, rows };
      });
    } catch {
      // Offline or a hiccup — try again on the next tick.
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) void refreshQuietly();
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
    };
  }, [refreshQuietly]);

  function handleSaved(unitId: string, saved: { sellingPrice: number | null; serialNumber: string | null }) {
    setData((current) => {
      if (!current.ok) return current;
      const wasUnpriced = current.rows.find((row) => row.unitId === unitId)?.sellingPrice === null;
      const nowPriced = saved.sellingPrice !== null;
      return {
        ...current,
        todoCount: wasUnpriced && nowPriced ? Math.max(0, current.todoCount - 1) : current.todoCount,
        rows: current.rows.map((row) =>
          row.unitId === unitId ? { ...row, sellingPrice: saved.sellingPrice, serialNumber: saved.serialNumber } : row
        ),
      };
    });
  }

  const rows = useMemo(() => {
    if (!data.ok) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter((row) =>
      `${row.brand} ${row.model} ${row.color} ${row.serialNumber ?? ""}`.toLowerCase().includes(q)
    );
  }, [data, query]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-fg">Master stock</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          Every camera a picker has picked lands here. Add its selling price — and its serial number if it doesn&rsquo;t
          have one yet.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Show" className="flex gap-1.5">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              disabled={isPending}
              onClick={() => load(value)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-60",
                filter === value
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-glass-soft text-fg-muted hover:bg-glass-hover hover:text-fg"
              )}
            >
              {label}
              {value === "todo" && data.ok && data.todoCount > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs tabular-nums",
                    filter === value ? "bg-white/25" : "bg-warn-soft text-warn"
                  )}
                >
                  {data.todoCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-64">
          <Input
            type="text"
            placeholder="Search brand, model, colour or serial…"
            aria-label="Search master stock"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-9 py-1 text-sm"
          />
        </div>
      </div>

      {!data.ok && <Message variant="error">{data.error}</Message>}

      {data.ok && (
        <>
          <ul className={cn("space-y-3", isPending && "opacity-60")}>
            {rows.map((row) => (
              <MasterStockItem key={row.unitId} row={row} onSaved={handleSaved} />
            ))}
          </ul>

          {rows.length === 0 && (
            <Card className="px-4 py-8 text-center text-sm text-fg-subtle">
              {query
                ? "No matches."
                : filter === "todo"
                  ? "Nothing waiting — every picked camera has a selling price."
                  : "No picked cameras yet."}
            </Card>
          )}

          {data.limited && (
            <p className="text-center text-xs text-fg-subtle">Showing the most recent {data.rows.length} cameras.</p>
          )}
        </>
      )}
    </div>
  );
}
