"use client";

import { useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { searchModelOptions } from "./models-section";
import {
  listVariantsForModel,
  renameVariant,
  mergeVariantsAction,
  type VariantRow,
} from "./catalog-actions";
import { Button, Card, Input, Message, Select } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function VariantsSection() {
  const [model, setModel] = useState<ComboboxOption | null>(null);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [mergeTarget, setMergeTarget] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmMerge, setConfirmMerge] = useState<{ source: VariantRow; target: VariantRow } | null>(null);

  async function refresh(modelId: string) {
    const data = await listVariantsForModel(modelId);
    setVariants(data);
  }

  async function handleSelectModel(opt: ComboboxOption) {
    setModel(opt);
    setMessage(null);
    await refresh(opt.id);
  }

  async function handleRename(id: string) {
    const color = drafts[id];
    if (!color || !color.trim()) return;
    setBusyId(id);
    setMessage(null);
    const result = await renameVariant(id, color);
    setBusyId(null);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    if (model) await refresh(model.id);
  }

  async function handleMerge(sourceId: string) {
    const targetId = mergeTarget[sourceId];
    if (!targetId) return;
    setBusyId(sourceId);
    setMessage(null);
    const result = await mergeVariantsAction(sourceId, targetId);
    setBusyId(null);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    if (model) await refresh(model.id);
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-4 sm:px-5">
        <h2 className="text-sm font-semibold text-fg">Colors</h2>
        <p className="mt-0.5 text-sm text-fg-muted">Pick a model to rename or merge its duplicate colors.</p>
      </div>
      <div className="px-4 py-3.5 sm:px-5">
        <Combobox
          label=""
          placeholder="Search for a model"
          value={model}
          onSelect={handleSelectModel}
          onCreateNew={() => {}}
          search={searchModelOptions}
        />
      </div>

      {model && (
        <>
          {message && <Message variant="error" className="px-4 pb-2 sm:px-5">{message}</Message>}
          <ul className="divide-y divide-line-soft">
            {variants.map((v) => (
              <li key={v.id} className="space-y-2.5 px-4 py-3.5 sm:px-5">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    defaultValue={v.color}
                    onChange={(e) => setDrafts((d) => ({ ...d, [v.id]: e.target.value }))}
                    className="max-w-xs"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleRename(v.id)}
                    disabled={busyId === v.id || !drafts[v.id] || drafts[v.id] === v.color}
                  >
                    Save
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-fg-subtle">merge into</span>
                  <Select
                    value={mergeTarget[v.id] ?? ""}
                    onChange={(e) => setMergeTarget((m) => ({ ...m, [v.id]: e.target.value }))}
                    className="min-h-9 w-auto max-w-xs py-1 text-sm"
                  >
                    <option value="">Select a color…</option>
                    {variants
                      .filter((other) => other.id !== v.id)
                      .map((other) => (
                        <option key={other.id} value={other.id}>
                          {other.color}
                        </option>
                      ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      const target = variants.find((other) => other.id === mergeTarget[v.id]);
                      if (target) setConfirmMerge({ source: v, target });
                    }}
                    disabled={busyId === v.id || !mergeTarget[v.id]}
                  >
                    Merge
                  </Button>
                </div>
              </li>
            ))}
            {variants.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-fg-muted sm:px-5">
                No colors for this model yet.
              </li>
            )}
          </ul>
        </>
      )}
      <ConfirmDialog
        open={confirmMerge !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmMerge(null);
        }}
        title="Merge colors?"
        description={
          confirmMerge && (
            <>
              <p>
                Everything under <span className="font-medium text-fg">&ldquo;{confirmMerge.source.color}&rdquo;</span> moves to{" "}
                <span className="font-medium text-fg">&ldquo;{confirmMerge.target.color}&rdquo;</span>, then &ldquo;{confirmMerge.source.color}&rdquo; is deleted.
              </p>
              <p>Its cameras and stock are moved too. This can&rsquo;t be undone.</p>
            </>
          )
        }
        confirmLabel="Merge colors"
        destructive
        busy={confirmMerge !== null && busyId === confirmMerge.source.id}
        onConfirm={() => {
          if (!confirmMerge) return;
          void handleMerge(confirmMerge.source.id).then(() => setConfirmMerge(null));
        }}
      />
    </Card>
  );
}
