"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Undo2 } from "lucide-react";
import { Badge, Button, Card, Field, Input, Message } from "@/components/ui";
import { ColorPill } from "@/components/color-pill";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SerialInput } from "@/components/serial-input";
import { cn } from "@/lib/cn";
import {
  listMasterStock,
  refuseMasterStock,
  saveMasterStockDetails,
  type MasterStockFilter,
  type MasterStockList,
  type MasterStockRow,
} from "./actions";

// How often the open page checks for newly picked cameras (it also checks the
// moment the tab comes back into view).
const POLL_MS = 8000;

const FILTERS: { value: MasterStockFilter; label: string }[] = [
  { value: "todo", label: "Waiting" },
  { value: "done", label: "Accepted" },
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
  onRefused,
}: {
  row: MasterStockRow;
  onSaved: (unitId: string, saved: { sellingPrice: number | null; serialNumber: string | null }) => void;
  onRefused: (unitId: string) => void;
}) {
  const [price, setPrice] = useState(priceText(row.sellingPrice));
  const [serial, setSerial] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [refuseBusy, setRefuseBusy] = useState(false);
  const [refuseError, setRefuseError] = useState<string | null>(null);

  // A serial already on the camera stays as it is; only a missing one can be filled in here.
  const hasSerial = row.serialNumber !== null;
  // Price and serial are optional. A camera on hold can always be saved (that
  // accepts it); once accepted, Save is only offered when something new is typed.
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

  async function handleRefuse() {
    setRefuseBusy(true);
    setRefuseError(null);
    try {
      const result = await refuseMasterStock(row.unitId);
      if (!result.ok) {
        setRefuseError(result.error);
        return;
      }
      setRefusing(false);
      onRefused(row.unitId);
    } catch {
      setRefuseError("Could not return it — check your connection and try again.");
    } finally {
      setRefuseBusy(false);
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
              {row.accepted ? <Badge tone="success">Accepted</Badge> : <Badge tone="warning">On hold</Badge>}
              {row.sellingPrice !== null && <Badge>£{row.sellingPrice.toFixed(2)}</Badge>}
            </div>
          </div>
          <p className="text-xs text-fg-subtle" suppressHydrationWarning>
            {pickedLabel(row)}
          </p>
        </div>
        {row.note && <p className="mt-2 text-xs text-fg-muted">Note: {row.note}</p>}

        <form onSubmit={handleSave} className="mt-4 grid gap-3 sm:grid-cols-[1fr_11rem] sm:items-end">
          {hasSerial ? (
            <div>
              <p className="mb-1.5 text-sm font-medium text-fg">Serial number</p>
              <p className="flex min-h-11 items-center font-mono text-sm text-fg">{row.serialNumber}</p>
            </div>
          ) : (
            <Field label="Serial number" hint="Optional — this camera has none yet.">
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

          <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={saving || refuseBusy}
              onClick={() => {
                setRefuseError(null);
                setRefusing(true);
              }}
            >
              <Undo2 aria-hidden="true" />
              Refuse &amp; return to stock
            </Button>
            <Button type="submit" disabled={saving || refuseBusy || (row.accepted && !dirty)}>
              {saving ? "Saving…" : row.accepted ? "Update" : "Save & accept"}
            </Button>
          </div>
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

      <ConfirmDialog
        open={refusing}
        onOpenChange={(open) => {
          if (!open) {
            setRefusing(false);
            setRefuseError(null);
          }
        }}
        title="Refuse this camera?"
        description={
          <>
            <p className="font-medium text-fg">
              {row.brand} {row.model} · {row.color} · Grade {row.grade}
              {row.serialNumber ? ` · SN ${row.serialNumber}` : ""}
            </p>
            <p>
              It goes back into the inventory as in stock, its quantity is added back, and it leaves this list. Any
              selling price entered here is dropped.
            </p>
          </>
        }
        confirmLabel="Refuse & return"
        destructive
        busy={refuseBusy}
        error={refuseError}
        onConfirm={() => void handleRefuse()}
      />
    </li>
  );
}

export function MasterStockScreen({ initial }: { initial: MasterStockList }) {
  const [filter, setFilter] = useState<MasterStockFilter>("todo");
  const [data, setData] = useState<MasterStockList>(initial);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // The timer below reads the current tab from here, so it never uses a stale one.
  const filterRef = useRef(filter);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  function load(next: MasterStockFilter) {
    setFilter(next);
    setNotice(null);
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
        // On "Waiting", a camera accepted a moment ago is no longer in the server's
        // list. Keep it on screen (with its "Saved" tick) until the tab is changed,
        // rather than having it vanish under the person's cursor.
        const fresh = new Set(latest.rows.map((row) => row.unitId));
        const justAccepted =
          requested === "todo" ? current.rows.filter((row) => row.accepted && !fresh.has(row.unitId)) : [];
        const rows = [...latest.rows, ...justAccepted].sort((a, b) => b.pickedAt.localeCompare(a.pickedAt));
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
      const wasWaiting = current.rows.find((row) => row.unitId === unitId)?.accepted === false;
      return {
        ...current,
        todoCount: wasWaiting ? Math.max(0, current.todoCount - 1) : current.todoCount,
        rows: current.rows.map((row) =>
          row.unitId === unitId
            ? { ...row, accepted: true, sellingPrice: saved.sellingPrice, serialNumber: saved.serialNumber }
            : row
        ),
      };
    });
  }

  function handleRefused(unitId: string) {
    setData((current) => {
      if (!current.ok) return current;
      const refused = current.rows.find((row) => row.unitId === unitId);
      if (refused) setNotice(`${refused.brand} ${refused.model} returned to stock.`);
      return {
        ...current,
        todoCount: refused && !refused.accepted ? Math.max(0, current.todoCount - 1) : current.todoCount,
        rows: current.rows.filter((row) => row.unitId !== unitId),
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
          Every camera a picker picks waits here on hold — it still counts in stock. Save it to accept it (price and
          serial are optional); only then does the stock go down. Refuse it to send it back to the inventory.
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

      {notice && <Message variant="success">{notice}</Message>}
      {!data.ok && <Message variant="error">{data.error}</Message>}

      {data.ok && (
        <>
          <ul className={cn("space-y-3", isPending && "opacity-60")}>
            {rows.map((row) => (
              <MasterStockItem key={row.unitId} row={row} onSaved={handleSaved} onRefused={handleRefused} />
            ))}
          </ul>

          {rows.length === 0 && (
            <Card className="px-4 py-8 text-center text-sm text-fg-subtle">
              {query
                ? "No matches."
                : filter === "todo"
                  ? "Nothing waiting — every picked camera has been accepted or returned."
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
