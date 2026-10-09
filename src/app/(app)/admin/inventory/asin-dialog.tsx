"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button, Field, Input, Message } from "@/components/ui";
import { MAX_ASINS, normalizeAsin, validateAsins } from "@/lib/asin";
import { saveAsins, type InventoryRow } from "./actions";

const LABELS = ["ASIN (required)", "Extra ASIN 2 (optional)", "Extra ASIN 3 (optional)"];

// Edits one inventory line's ASINs: one required, up to two extra.
export function AsinDialog({
  row,
  onClose,
  onSaved,
}: {
  row: InventoryRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  return (
    <Dialog.Root open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className="glass-strong fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl p-6 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95"
        >
          {/* Remounted per line so the fields always start from that line's saved ASINs. */}
          {row && <AsinForm key={row.variantId} row={row} onClose={onClose} onSaved={onSaved} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AsinForm({
  row,
  onClose,
  onSaved,
}: {
  row: InventoryRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [values, setValues] = useState<string[]>(() => Array.from({ length: MAX_ASINS }, (_, i) => row.asins[i] ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [badIndex, setBadIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBadIndex(null);

    const checked = validateAsins(values);
    if (!checked.ok) {
      setError(checked.error);
      setBadIndex(checked.index ?? null);
      return;
    }

    setSaving(true);
    try {
      const result = await saveAsins(row.variantId, checked.asins);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(`ASINs saved for ${row.brand} ${row.model} · ${row.color}.`);
    } catch {
      setError("Could not save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Dialog.Title className="text-base font-semibold text-fg">
            {row.asins.length > 0 ? "Edit ASINs" : "Add ASIN"}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-fg-muted">
            {row.brand} {row.model} · {row.color}
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

      <div className="mt-5 space-y-4">
        {values.map((value, i) => (
          <Field key={i} label={LABELS[i]} hint={i === 0 ? "10 letters or numbers, e.g. B0CHX1W1XY." : undefined}>
            <Input
              type="text"
              autoFocus={i === 0}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={12}
              value={value}
              aria-invalid={badIndex === i}
              placeholder={i === 0 ? "B0XXXXXXXX" : "Optional"}
              onChange={(e) => setValues((prev) => prev.map((v, j) => (j === i ? normalizeAsin(e.target.value) : v)))}
              className={`font-mono tracking-wide ${badIndex === i ? "border-danger-line" : ""}`}
            />
          </Field>
        ))}
      </div>

      {error && <Message variant="error" className="mt-4">{error}</Message>}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save ASINs"}
        </Button>
      </div>
    </form>
  );
}
