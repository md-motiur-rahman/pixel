"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startStockCount, recordScan, getTally, finishStockCount, adjustFromCount, type TallyRow } from "./actions";
import { createOfflineQueue } from "@/lib/offline-queue";
import { useFilteredQueueCount } from "@/hooks/use-queue-length";
import { Button, Card, Field, Input, Message } from "@/components/ui";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { CameraScanButton } from "@/components/camera-scan-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cn } from "@/lib/cn";

type QueuedScan = { stockCountId: string; unitId: string };

const SCAN_QUEUE_KEY = "checker-scan-queue";
const scanQueue = createOfflineQueue<QueuedScan>(SCAN_QUEUE_KEY);

export function CountSession({
  initialStockCountId,
  initialTally,
}: {
  initialStockCountId: string | null;
  initialTally: TallyRow[];
}) {
  const [stockCountId, setStockCountId] = useState<string | null>(initialStockCountId);
  const [scan, setScan] = useState("");
  const [tally, setTally] = useState<TallyRow[]>(initialTally);
  // Only cameras that have actually been scanned this session are shown; lines
  // that exist in the system but were not scanned stay out of the table.
  const scannedRows = tally.filter((row) => row.scannedQty > 0);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inFlightCount, setInFlightCount] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [adjusting, setAdjusting] = useState<TallyRow | null>(null);
  const [adjustBusy, setAdjustBusy] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCount = useFilteredQueueCount(
    scanQueue,
    SCAN_QUEUE_KEY,
    useCallback((item) => item.payload.stockCountId === stockCountId, [stockCountId])
  );

  const flushQueue = useCallback(async () => {
    if (!stockCountId) return;
    for (const item of scanQueue.list()) {
      if (item.payload.stockCountId !== stockCountId) continue;
      try {
        const result = await recordScan(item.payload.stockCountId, item.payload.unitId);
        // Only drop it once retrying truly can't help: it either synced, or
        // the server gave a *permanent* rejection (e.g. no such unit, or the
        // session was finished). A transient upsert error must stay queued —
        // otherwise a real scan silently vanishes.
        if (result.ok || result.permanent) {
          scanQueue.removeItem(item.id);
          if (!result.ok) {
            setError(`A queued scan failed to record and was dropped: ${result.error}`);
          }
        } else {
          break; // retriable failure — keep queued, try again later
        }
      } catch {
        break; // still offline — stop here, retry on the next 'online' event
      }
    }
    const tallyResult = await getTally(stockCountId);
    if (tallyResult.ok) {
      setTally(tallyResult.tally);
    } else {
      setError(`Could not refresh the tally: ${tallyResult.error}`);
    }
  }, [stockCountId]);

  useEffect(() => {
    if (stockCountId) inputRef.current?.focus();
  }, [stockCountId, tally]);

  useEffect(() => {
    if (!stockCountId) return;
    // Catch up on anything left queued from a previous visit — deferred a
    // tick so this is a callback invocation, not a direct effect-body call.
    const timeoutId = setTimeout(() => void flushQueue(), 0);
    window.addEventListener("online", flushQueue);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("online", flushQueue);
    };
  }, [stockCountId, flushQueue]);

  async function performScan(value: string) {
    if (!stockCountId || !value.trim() || finishing) return;
    setScan("");
    setError(null);
    setInFlightCount((n) => n + 1);

    try {
      const result = await recordScan(stockCountId, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLastMessage(result.alreadyScanned ? "Already scanned in this session" : "Scanned");

      const tallyResult = await getTally(stockCountId);
      if (tallyResult.ok) {
        setTally(tallyResult.tally);
      } else {
        setError(`Scan recorded, but couldn't refresh the tally: ${tallyResult.error}`);
      }
    } catch {
      const queued = scanQueue.enqueue({ stockCountId, unitId: value });
      if (queued.ok) {
        setLastMessage("Offline — queued, will sync automatically once you're back online.");
      } else {
        // Couldn't even save it locally (storage full/blocked) — don't claim
        // it's queued when it's actually just gone.
        setError("You're offline and this device couldn't save the scan either. Try again once you're back online.");
      }
    } finally {
      setInFlightCount((n) => n - 1);
    }
  }

  function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    void performScan(scan);
  }

  async function handleFinish() {
    if (!stockCountId) return;
    if (pendingCount > 0 || inFlightCount > 0) {
      setError(
        `${pendingCount + inFlightCount} scan(s) are still being recorded or waiting to sync — try again in a moment.`
      );
      return;
    }
    setFinishing(true);
    setError(null);
    try {
      const result = await finishStockCount(stockCountId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStockCountId(null);
      setTally([]);
    } catch {
      setError("Could not finish — check your connection and try again.");
    } finally {
      setFinishing(false);
    }
  }

  async function handleAdjust() {
    if (!stockCountId || !adjusting) return;
    setAdjustBusy(true);
    setAdjustError(null);
    try {
      const row = adjusting;
      const result = await adjustFromCount(stockCountId, row.skuLineId, row.systemQty);
      if (!result.ok) {
        setAdjustError(result.error);
        return;
      }
      setAdjusting(null);
      setError(null);
      setLastMessage(`${row.brand} ${row.model} (${row.color}, Grade ${row.grade}) adjusted: ${row.systemQty} → ${row.scannedQty}.`);
      const tallyResult = await getTally(stockCountId);
      if (tallyResult.ok) {
        setTally(tallyResult.tally);
      } else {
        setError(`Adjusted, but couldn't refresh the tally: ${tallyResult.error}`);
      }
    } catch {
      setAdjustError("Could not adjust — check your connection and try again.");
    } finally {
      setAdjustBusy(false);
    }
  }

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const result = await startStockCount();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStockCountId(result.stockCountId);
      setTally([]);
    } catch {
      setError("Could not start — check your connection and try again.");
    } finally {
      setStarting(false);
    }
  }

  // A line's scanned total isn't final while scans are still being recorded or
  // waiting to sync, so adjusting stock to it would be premature.
  const adjustLocked = finishing || pendingCount > 0 || inFlightCount > 0;

  if (!stockCountId) {
    return (
      <Card className="p-6 text-center sm:p-8">
        <p className="text-sm text-fg-muted">Start a new session, then scan every camera on the shelf.</p>
        <Button onClick={handleStart} disabled={starting} className="mt-4">
          {starting ? "Starting…" : "Start new count"}
        </Button>
        {error && <Message variant="error" className="mt-3">{error}</Message>}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <form onSubmit={handleScanSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Scan a camera QR">
              <Input
                ref={inputRef}
                type="text"
                autoFocus
                disabled={finishing}
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                placeholder={finishing ? "Finishing session…" : "Waiting for scan…"}
                className="text-center text-lg tracking-wide sm:text-left"
              />
            </Field>
          </div>
          <Button type="button" variant="secondary" onClick={handleFinish} disabled={finishing}>
            {finishing ? "Finishing…" : "Finish session"}
          </Button>
        </form>

        <div className="mt-3">
          <CameraScanButton onScan={(value) => void performScan(value)} disabled={finishing} />
        </div>

        {(pendingCount > 0 || inFlightCount > 0) && (
          <Message variant="warning" className="mt-3 rounded-lg bg-warn-soft px-3.5 py-2.5">
            {pendingCount + inFlightCount} scan(s) queued or in progress, waiting to sync.
          </Message>
        )}
        {error && <Message variant="error" className="mt-3">{error}</Message>}
        {!error && lastMessage && <Message className="mt-3">{lastMessage}</Message>}
      </Card>

      <Card className="overflow-hidden">
        <div className="-mx-px overflow-x-auto">
          <table className="w-full min-w-140 text-sm">
            <thead className="border-b border-line-soft bg-glass-soft text-left text-xs uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="px-3.5 py-2.5 font-medium">Brand</th>
                <th className="px-3.5 py-2.5 font-medium">Model</th>
                <th className="px-3.5 py-2.5 font-medium">Color</th>
                <th className="px-3.5 py-2.5 font-medium">Grade</th>
                <th className="px-3.5 py-2.5 text-right font-medium">System</th>
                <th className="px-3.5 py-2.5 text-right font-medium">Scanned</th>
                <th className="px-3.5 py-2.5 text-right font-medium">Diff</th>
                <th className="w-px px-3.5 py-2.5 text-right font-medium">Adjust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {scannedRows.map((row) => (
                <tr key={row.skuLineId} className={cn("transition-colors hover:bg-glass-soft", row.diff !== 0 && "bg-danger-soft")}>
                  <td className="whitespace-nowrap px-3.5 py-2.5">{row.brand}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">{row.model}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">{row.color}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">{row.grade}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right">{row.systemQty}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right">{row.scannedQty}</td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-3.5 py-2.5 text-right font-medium",
                      row.diff === 0 ? "text-fg-muted" : "text-danger"
                    )}
                  >
                    {row.diff > 0 ? `+${row.diff}` : row.diff}
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-1.5 text-right">
                    {row.diff !== 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant={row.diff < 0 ? "destructive" : "secondary"}
                        disabled={adjustLocked}
                        title={
                          adjustLocked
                            ? "Wait for pending scans to finish syncing"
                            : `Set system stock to ${row.scannedQty}`
                        }
                        aria-label={`${row.diff < 0 ? "Reduce" : "Increase"} system stock for ${row.brand} ${row.model} ${row.color} Grade ${row.grade} to ${row.scannedQty}`}
                        onClick={() => {
                          setAdjustError(null);
                          setAdjusting(row);
                        }}
                        className="min-h-9 px-2.5"
                      >
                        {row.diff < 0 ? <Minus aria-hidden="true" /> : <Plus aria-hidden="true" />}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {scannedRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3.5 py-8 text-center text-fg-subtle">
                    No scans yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={adjusting !== null}
        onOpenChange={(open) => {
          if (!open) setAdjusting(null);
        }}
        title={adjusting && adjusting.diff < 0 ? "Reduce system stock?" : "Increase system stock?"}
        description={
          adjusting && (
            <>
              <p className="font-medium text-fg">
                {adjusting.brand} {adjusting.model} · {adjusting.color} · Grade {adjusting.grade}
              </p>
              <p className="flex items-center gap-2 text-base font-semibold text-fg">
                {adjusting.systemQty}
                <ArrowRight aria-hidden="true" className="size-4 text-fg-subtle" />
                {adjusting.scannedQty}
                <span className={cn("text-sm font-medium", adjusting.diff > 0 ? "text-success" : "text-danger")}>
                  ({adjusting.diff > 0 ? "+" : ""}
                  {adjusting.diff})
                </span>
              </p>
              {adjusting.diff > 0 ? (
                <p>
                  More cameras were scanned than the system has in stock, so some of the scanned ones are recorded as
                  picked or shipped. Confirming puts those cameras back in stock and sets the system stock to{" "}
                  {adjusting.scannedQty}.
                </p>
              ) : (
                <p>
                  The system says {adjusting.systemQty}, but {adjusting.scannedQty}{" "}
                  {adjusting.scannedQty === 1 ? "was" : "were"} scanned so far. Confirming sets the system stock to{" "}
                  {adjusting.scannedQty}.
                </p>
              )}
              <p>This is recorded in the adjustment log.</p>
            </>
          )
        }
        confirmLabel={adjusting && adjusting.diff < 0 ? `Reduce to ${adjusting.scannedQty}` : `Increase to ${adjusting?.scannedQty ?? ""}`}
        destructive={adjusting !== null && adjusting.diff < 0}
        busy={adjustBusy}
        error={adjustError}
        onConfirm={() => void handleAdjust()}
      />
    </div>
  );
}
