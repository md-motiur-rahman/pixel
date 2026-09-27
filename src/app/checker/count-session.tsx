"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startStockCount, recordScan, getTally, finishStockCount, type TallyRow } from "./actions";
import { createOfflineQueue } from "@/lib/offline-queue";
import { useFilteredQueueCount } from "@/hooks/use-queue-length";
import { Button, Card, Field, Input, Message } from "@/components/ui";
import { CameraScanButton } from "@/components/camera-scan-button";
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
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inFlightCount, setInFlightCount] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [starting, setStarting] = useState(false);
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
        // Either it synced, or the server permanently rejected it (e.g. the
        // unit no longer exists) — either way, retrying won't help, so it
        // comes out of the queue. A thrown error (still offline) is the only
        // case that should keep it queued for the next attempt.
        scanQueue.removeItem(item.id);
        if (!result.ok) {
          setError(`A queued scan failed to record and was dropped: ${result.error}`);
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
    if (!stockCountId || !value.trim()) return;
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
      scanQueue.enqueue({ stockCountId, unitId: value });
      setLastMessage("Offline — queued, will sync automatically once you're back online.");
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
    const result = await finishStockCount(stockCountId);
    setFinishing(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStockCountId(null);
    setTally([]);
  }

  async function handleStart() {
    setStarting(true);
    setError(null);
    const result = await startStockCount();
    setStarting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStockCountId(result.stockCountId);
    setTally([]);
  }

  if (!stockCountId) {
    return (
      <Card className="p-6 text-center sm:p-8">
        <p className="text-sm text-neutral-500">Start a new session, then scan every camera on the shelf.</p>
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
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                placeholder="Waiting for scan…"
                className="text-center text-lg tracking-wide sm:text-left"
              />
            </Field>
          </div>
          <Button type="button" variant="secondary" onClick={handleFinish} disabled={finishing}>
            {finishing ? "Finishing…" : "Finish session"}
          </Button>
        </form>

        <div className="mt-3">
          <CameraScanButton onScan={(value) => void performScan(value)} />
        </div>

        {(pendingCount > 0 || inFlightCount > 0) && (
          <Message variant="warning" className="mt-3 rounded-lg bg-amber-50 px-3.5 py-2.5">
            {pendingCount + inFlightCount} scan(s) queued or in progress, waiting to sync.
          </Message>
        )}
        {error && <Message variant="error" className="mt-3">{error}</Message>}
        {!error && lastMessage && <Message className="mt-3">{lastMessage}</Message>}
      </Card>

      <Card className="overflow-hidden">
        <div className="-mx-px overflow-x-auto">
          <table className="w-full min-w-140 text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-3.5 py-2.5 font-medium">Brand</th>
                <th className="px-3.5 py-2.5 font-medium">Model</th>
                <th className="px-3.5 py-2.5 font-medium">Color</th>
                <th className="px-3.5 py-2.5 font-medium">Grade</th>
                <th className="px-3.5 py-2.5 text-right font-medium">System</th>
                <th className="px-3.5 py-2.5 text-right font-medium">Scanned</th>
                <th className="px-3.5 py-2.5 text-right font-medium">Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {tally.map((row) => (
                <tr key={row.skuLineId} className={row.diff !== 0 ? "bg-red-50/60" : undefined}>
                  <td className="whitespace-nowrap px-3.5 py-2.5">{row.brand}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">{row.model}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">{row.color}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">{row.grade}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right">{row.systemQty}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right">{row.scannedQty}</td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-3.5 py-2.5 text-right font-medium",
                      row.diff === 0 ? "text-neutral-500" : "text-red-600"
                    )}
                  >
                    {row.diff > 0 ? `+${row.diff}` : row.diff}
                  </td>
                </tr>
              ))}
              {tally.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3.5 py-8 text-center text-neutral-400">
                    No scans yet.
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
