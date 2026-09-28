"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lookupUnit, pickUnit, undoPick, type UnitDetails } from "./actions";
import { createOfflineQueue } from "@/lib/offline-queue";
import { useQueueLength } from "@/hooks/use-queue-length";
import { Button, Card, Field, Input, Message } from "@/components/ui";
import { CameraScanButton } from "@/components/camera-scan-button";
import { cn } from "@/lib/cn";

const PICK_QUEUE_KEY = "dispatcher-pick-queue";
const pickQueue = createOfflineQueue<{ unitId: string }>(PICK_QUEUE_KEY);

const STATUS_BADGE: Record<UnitDetails["status"], string> = {
  in_stock: "bg-emerald-50 text-emerald-700",
  picked: "bg-amber-50 text-amber-700",
  shipped: "bg-neutral-100 text-neutral-600",
};

export function ScanPanel() {
  const [scan, setScan] = useState("");
  const [unit, setUnit] = useState<UnitDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Which lookup produced what's currently on screen — a pick/undo response
  // (or a later lookup response) only applies if this hasn't moved on since.
  const lookupSeqRef = useRef(0);
  // unitRef mirrors `unit` so the stable flushQueue callback can tell whether
  // a background sync is for the unit currently on screen, without needing
  // `unit` in its dependency array.
  const unitRef = useRef(unit);
  useEffect(() => {
    unitRef.current = unit;
  });
  // Unit ids a background flush has already sent to the server and is still
  // waiting on — Undo must not "cancel" one of these locally, since the
  // server may commit the pick after the local cancel already ran.
  const inFlightPickIdsRef = useRef<Set<string>>(new Set());
  const pendingCount = useQueueLength(pickQueue, PICK_QUEUE_KEY);

  const flushQueue = useCallback(async () => {
    for (const item of pickQueue.list()) {
      inFlightPickIdsRef.current.add(item.payload.unitId);
      try {
        const result = await pickUnit(item.payload.unitId);
        // Only drop it once we know retrying can't help: it either synced,
        // or the server gave a *permanent* rejection (e.g. already picked by
        // someone else). "Not signed in" and other transient errors must
        // stay queued — otherwise a real pick silently vanishes.
        if (result.ok || result.permanent) {
          pickQueue.removeItem(item.id);
          if (!result.ok) {
            setError(`A queued pick failed to sync and was dropped: ${result.error}`);
          } else if (unitRef.current?.id === item.payload.unitId) {
            // Still showing this unit — replace the "(pending sync)"
            // placeholder with the confirmed server data.
            setUnit(result.unit);
          }
        } else {
          break; // retriable failure — keep queued, try again later
        }
      } catch {
        break; // still offline — stop here, retry on the next 'online' event
      } finally {
        inFlightPickIdsRef.current.delete(item.payload.unitId);
      }
    }
  }, []);

  useEffect(() => {
    // Catch up on anything left queued from a previous visit — deferred a
    // tick so this is a callback invocation, not a direct effect-body call.
    const timeoutId = setTimeout(() => void flushQueue(), 0);
    window.addEventListener("online", flushQueue);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("online", flushQueue);
    };
  }, [flushQueue]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [unit]);

  async function performLookup(value: string) {
    if (!value.trim()) return;
    // A second scan can start before the first one's response arrives; if
    // that first response lands after, it must not overwrite the newer
    // camera on screen — someone could then Pick the wrong unit.
    const seq = ++lookupSeqRef.current;
    setLoading(true);
    setError(null);
    setUnit(null);
    // A stale Pick/Undo response for the *previous* unit could otherwise
    // arrive after this reset and re-disable these buttons for the new one.
    setPicking(false);
    setUndoing(false);

    try {
      const result = await lookupUnit(value);
      if (seq !== lookupSeqRef.current) return; // superseded by a newer scan
      setLoading(false);
      setScan("");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUnit(result.unit);
    } catch {
      if (seq !== lookupSeqRef.current) return;
      setLoading(false);
      setScan("");
      setError("You're offline — looking up a camera needs a connection.");
    }
  }

  function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    void performLookup(scan);
  }

  async function handlePick() {
    if (!unit) return;
    const pickedUnitId = unit.id;
    const seq = lookupSeqRef.current;
    setPicking(true);
    setError(null);

    try {
      const result = await pickUnit(pickedUnitId);
      if (seq !== lookupSeqRef.current) return; // a newer scan replaced the screen
      setPicking(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUnit(result.unit);
    } catch {
      // The pick attempt itself must not be lost just because the dispatcher
      // has since scanned something else — queue it regardless, and only
      // skip the on-screen update if it's no longer what's displayed.
      const queued = pickQueue.enqueue({ unitId: pickedUnitId });
      if (seq !== lookupSeqRef.current) return;
      setPicking(false);
      if (!queued.ok) {
        // Couldn't even save it locally (storage full/blocked) — don't claim
        // it's queued when it's actually just gone.
        setError("You're offline and this device couldn't save the pick either. Try again once you're back online.");
        return;
      }
      setUnit((current) =>
        current && current.id === pickedUnitId
          ? { ...current, status: "picked", pickedByName: "You (pending sync)", pickedAt: new Date().toISOString() }
          : current
      );
    }
  }

  async function handleUndoPick() {
    if (!unit) return;
    const unitId = unit.id;
    const seq = lookupSeqRef.current;

    if (inFlightPickIdsRef.current.has(unitId)) {
      setError("This pick is still syncing — wait a moment and try again.");
      return;
    }

    // If the pick hasn't actually reached the server yet (still queued from
    // an offline moment), just cancel it locally — nothing to undo remotely.
    const queuedPick = pickQueue.list().find((item) => item.payload.unitId === unitId);
    if (queuedPick) {
      pickQueue.removeItem(queuedPick.id);
      setUnit((current) =>
        current && current.id === unitId
          ? { ...current, status: "in_stock", pickedByName: null, pickedAt: null }
          : current
      );
      return;
    }

    setUndoing(true);
    setError(null);
    try {
      const result = await undoPick(unitId);
      if (seq !== lookupSeqRef.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUnit(result.unit);
    } catch {
      if (seq !== lookupSeqRef.current) return;
      setError("You're offline — undoing a pick needs a connection.");
    } finally {
      if (seq === lookupSeqRef.current) setUndoing(false);
    }
  }

  return (
    <div className="space-y-4">
      {pendingCount > 0 && (
        <Message variant="warning" className="rounded-lg bg-amber-50 px-3.5 py-2.5">
          {pendingCount} pick(s) queued, waiting to sync.
        </Message>
      )}

      <Card className="p-5 sm:p-6">
        <form onSubmit={handleScanSubmit}>
          <Field label="Scan a camera QR">
            <Input
              ref={inputRef}
              type="text"
              autoFocus
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              placeholder="Waiting for scan…"
              className="text-center text-lg tracking-wide"
            />
          </Field>
        </form>
        <div className="mt-3">
          <CameraScanButton onScan={(value) => void performLookup(value)} />
        </div>
        {loading && <p className="mt-3 text-sm text-neutral-500">Looking up…</p>}
        {error && <Message variant="error" className="mt-3">{error}</Message>}
      </Card>

      {unit && (
        <Card className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-neutral-900">
                {unit.brand} {unit.model} — {unit.color}
              </p>
              <p className="text-sm text-neutral-500">Grade {unit.grade}</p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                STATUS_BADGE[unit.status]
              )}
            >
              {unit.status.replace("_", " ")}
            </span>
          </div>

          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-500">Serial</dt>
              <dd className="text-right text-neutral-900">{unit.serialNumber}</dd>
            </div>
            {unit.note && (
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">Note</dt>
                <dd className="text-right text-neutral-900">{unit.note}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-500">Tested by</dt>
              <dd className="text-right text-neutral-900">{unit.testerName}</dd>
            </div>
          </dl>

          <div className="mt-5">
            {unit.status === "in_stock" && (
              <Button onClick={handlePick} disabled={picking} className="w-full">
                {picking ? "Picking…" : "Pick this camera"}
              </Button>
            )}
            {unit.status !== "in_stock" && (
              <div className="space-y-2.5">
                <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                  Already {unit.status}
                  {unit.pickedByName ? ` by ${unit.pickedByName}` : ""}
                  {unit.pickedAt ? ` on ${new Date(unit.pickedAt).toLocaleString()}` : ""}.
                </p>
                {unit.status === "picked" && (
                  <Button variant="secondary" onClick={handleUndoPick} disabled={undoing} className="w-full">
                    {undoing ? "Undoing…" : "Undo pick (put back in stock)"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
