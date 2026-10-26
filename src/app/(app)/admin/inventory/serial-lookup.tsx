"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { Printer, Search, X } from "lucide-react";
import { findUnitForEdit, type EditableUnit } from "@/app/(app)/tester/edit-actions";
import { SerialInput } from "@/components/serial-input";
import { CameraScanButton } from "@/components/camera-scan-button";
import { ColorPill } from "@/components/color-pill";
import { Badge, Button, Message } from "@/components/ui";

// Find one exact camera by its (unique) serial number or QR, then reprint its label.
export function SerialLookup() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<EditableUnit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // A scan and a manual "Find" can both be in flight; only the latest may update the screen.
  const seqRef = useRef(0);

  async function find(input: string) {
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    setUnit(null);
    try {
      const result = await findUnitForEdit(input);
      if (seq !== seqRef.current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUnit(result.unit);
    } catch {
      if (seq !== seqRef.current) return;
      setError("Could not search — check your connection and try again.");
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }

  function reset() {
    setValue("");
    setUnit(null);
    setError(null);
  }

  const body = (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void find(value);
        }}
        className="mt-3 flex flex-col gap-2 sm:flex-row"
      >
        <div className="flex-1">
          <SerialInput
            placeholder="Type or scan the serial number"
            aria-label="Serial number"
            value={value}
            onValueChange={setValue}
            onScanned={(scanned) => void find(scanned)}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={loading || !value.trim()}>
          <Search aria-hidden="true" />
          {loading ? "Finding…" : "Find"}
        </Button>
      </form>

      <div className="mt-3">
        <CameraScanButton
          onScan={(scanned) => {
            setValue(scanned);
            void find(scanned);
          }}
        />
      </div>

      {error && <Message variant="error" className="mt-3">{error}</Message>}

      {unit && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-line-soft bg-glass-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-fg">
              {unit.brand} {unit.model}{" "}
              <ColorPill color={unit.color} className="ml-1 align-middle" />
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              <Badge tone="neutral" className="normal-case">
                Grade {unit.gradeCode}
              </Badge>
              <span>{unit.serialNumber ? `Serial ${unit.serialNumber}` : "No serial number"}</span>
            </p>
            {unit.note && <p className="mt-1 text-xs text-fg-subtle">Note: {unit.note}</p>}
          </div>
          <Button onClick={() => router.push(`/tester/print/${unit.id}`)} className="shrink-0">
            <Printer aria-hidden="true" />
            Reprint label
          </Button>
        </div>
      )}
    </>
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      {/* Same button + modal on every screen size — a permanently-open card
          here was eating a whole row above the table on both mobile and
          desktop before this. */}
      <Dialog.Trigger asChild>
        <Button type="button" variant="secondary">
          <Search aria-hidden="true" />
          Find a camera
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content className="glass-strong fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl p-6 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold text-fg">Find a camera by serial number</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-fg-muted">
                Look up one exact camera to reprint its QR label.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-glass-hover hover:text-fg"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </Dialog.Close>
          </div>
          {body}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
