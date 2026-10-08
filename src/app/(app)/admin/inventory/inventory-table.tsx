"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, Pencil, X } from "lucide-react";
import { Button, Card, Field, Input, Message } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cn } from "@/lib/cn";
import { adjustInventoryQuantity, type InventoryRow } from "./actions";

type Edit = { skuLineId: string; value: string };

function lineName(row: InventoryRow) {
  return `${row.brand} ${row.model} · ${row.color} · Grade ${row.grade}`;
}

export function InventoryTable({ initialRows }: { initialRows: InventoryRow[] }) {
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [confirming, setConfirming] = useState<{ row: InventoryRow; newQuantity: number } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialRows;
    return initialRows.filter((row) =>
      `${row.brand} ${row.model} ${row.color} ${row.grade}`.toLowerCase().includes(q)
    );
  }, [initialRows, query]);

  const totalUnits = useMemo(() => filtered.reduce((sum, row) => sum + row.quantity, 0), [filtered]);

  function startEdit(row: InventoryRow) {
    setNotice(null);
    setEdit({ skuLineId: row.skuLineId, value: String(row.quantity) });
  }

  function review(row: InventoryRow) {
    if (!edit) return;
    const newQuantity = Number(edit.value);
    if (edit.value.trim() === "" || !Number.isInteger(newQuantity) || newQuantity < 0) return;
    if (newQuantity === row.quantity) {
      setEdit(null);
      return;
    }
    setError(null);
    setNote("");
    setConfirming({ row, newQuantity });
  }

  async function applyChange() {
    if (!confirming) return;
    setSaving(true);
    setError(null);
    try {
      const { row, newQuantity } = confirming;
      const result = await adjustInventoryQuantity(row.skuLineId, newQuantity, row.quantity, note);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`${lineName(row)} updated: ${row.quantity} → ${newQuantity}.`);
      setConfirming(null);
      setEdit(null);
    } catch {
      setError("Could not save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          type="text"
          placeholder="Search brand, model, color, or grade…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        <p className="text-sm text-fg-muted">
          {filtered.length} line{filtered.length === 1 ? "" : "s"} · {totalUnits} camera
          {totalUnits === 1 ? "" : "s"} in stock
        </p>
      </div>

      {notice && <Message variant="success">{notice}</Message>}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-140 text-sm">
            <thead className="border-b border-line-soft bg-glass-soft text-left text-xs uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="px-3.5 py-2.5 font-medium">Brand</th>
                <th className="px-3.5 py-2.5 font-medium">Model</th>
                <th className="px-3.5 py-2.5 font-medium">Color</th>
                <th className="px-3.5 py-2.5 font-medium">Grade</th>
                <th className="px-3.5 py-2.5 text-right font-medium">Quantity</th>
                <th className="w-px px-3.5 py-2.5">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filtered.map((row) => {
                const editing = edit?.skuLineId === row.skuLineId ? edit : null;
                return (
                  <tr
                    key={row.skuLineId}
                    className={cn("transition-colors hover:bg-glass-soft", row.quantity === 0 && !editing && "text-fg-subtle")}
                  >
                    <td className="whitespace-nowrap px-3.5 py-2.5">{row.brand}</td>
                    <td className="whitespace-nowrap px-3.5 py-2.5">{row.model}</td>
                    <td className="whitespace-nowrap px-3.5 py-2.5">{row.color}</td>
                    <td className="whitespace-nowrap px-3.5 py-2.5">{row.grade}</td>
                    <td className="whitespace-nowrap px-3.5 py-2 text-right font-medium">
                      {editing ? (
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          autoFocus
                          aria-label={`New quantity for ${lineName(row)}`}
                          value={editing.value}
                          onChange={(e) => setEdit({ skuLineId: row.skuLineId, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") review(row);
                            if (e.key === "Escape") setEdit(null);
                          }}
                          className="ml-auto min-h-9 w-24 py-1 text-right text-sm"
                        />
                      ) : (
                        row.quantity
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2 text-right">
                      {editing ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" onClick={() => review(row)} aria-label="Review change" className="min-h-9 px-2.5">
                            <Check aria-hidden="true" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEdit(null)}
                            aria-label="Cancel editing"
                            className="min-h-9 px-2.5"
                          >
                            <X aria-hidden="true" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(row)}
                          aria-label={`Edit quantity for ${lineName(row)}`}
                          className="min-h-9 px-2.5"
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3.5 py-8 text-center text-fg-subtle">
                    {query ? "No matches." : "No inventory yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title="Change stock quantity?"
        description={
          confirming && (
            <>
              <p className="font-medium text-fg">{lineName(confirming.row)}</p>
              <p className="flex items-center gap-2 text-base font-semibold text-fg">
                {confirming.row.quantity}
                <ArrowRight aria-hidden="true" className="size-4 text-fg-subtle" />
                {confirming.newQuantity}
                <span className={cn("text-sm font-medium", confirming.newQuantity > confirming.row.quantity ? "text-success" : "text-danger")}>
                  ({confirming.newQuantity > confirming.row.quantity ? "+" : ""}
                  {confirming.newQuantity - confirming.row.quantity})
                </span>
              </p>
              <p>
                This changes the stock number only — individual cameras are not added or removed. The change is
                recorded in the adjustment log.
              </p>
              {confirming.newQuantity > confirming.row.quantity && (
                <p className="text-warn">
                  Adding cameras that aren&rsquo;t registered yet? Register them on the Tester page instead — otherwise
                  they&rsquo;ll be counted twice once they are.
                </p>
              )}
            </>
          )
        }
        confirmLabel="Confirm change"
        busy={saving}
        error={error}
        onConfirm={() => void applyChange()}
      >
        <Field label="Reason (optional)">
          <Input
            type="text"
            maxLength={200}
            placeholder="e.g. damaged unit written off"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
