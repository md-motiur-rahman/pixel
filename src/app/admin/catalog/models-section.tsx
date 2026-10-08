"use client";

import { useRef, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { searchModelsAdmin, renameModel, mergeModelsAction, type ModelRow } from "./catalog-actions";
import { Button, Card, Input, Message } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";

export async function searchModelOptions(query: string): Promise<ComboboxOption[]> {
  const results = await searchModelsAdmin(query);
  return results.map((m) => ({ id: m.id, label: `${m.brandName} — ${m.name}` }));
}

function ModelRowEditor({ model, onChanged }: { model: ModelRow; onChanged: () => void }) {
  const [name, setName] = useState(model.name);
  const [mergeTarget, setMergeTarget] = useState<ComboboxOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingMerge, setConfirmingMerge] = useState(false);

  async function handleRename() {
    setBusy(true);
    setMessage(null);
    const result = await renameModel(model.id, name);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    onChanged();
  }

  async function handleMerge() {
    if (!mergeTarget) return;
    setBusy(true);
    setMessage(null);
    const result = await mergeModelsAction(model.id, mergeTarget.id);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    onChanged();
  }

  return (
    <li className="space-y-2.5 px-4 py-3.5 sm:px-5">
      <p className="text-xs text-fg-muted">{model.brandName}</p>
      <div className="flex gap-2">
        <Input type="text" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
        <Button size="sm" variant="secondary" onClick={handleRename} disabled={busy || !name.trim() || name === model.name}>
          Save
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-fg-subtle">merge into</span>
        <div className="w-full max-w-64">
          <Combobox
            label=""
            placeholder="Search for the model to keep"
            value={mergeTarget}
            onSelect={setMergeTarget}
            onCreateNew={() => {}}
            search={searchModelOptions}
          />
        </div>
        <Button size="sm" variant="destructive" onClick={() => setConfirmingMerge(true)} disabled={busy || !mergeTarget}>
          Merge
        </Button>
      </div>
      {message && <Message variant="error">{message}</Message>}

      <ConfirmDialog
        open={confirmingMerge && mergeTarget !== null}
        onOpenChange={setConfirmingMerge}
        title="Merge models?"
        description={
          mergeTarget && (
            <>
              <p>
                Everything under <span className="font-medium text-fg">&ldquo;{`${model.brandName} — ${model.name}`}&rdquo;</span> moves to{" "}
                <span className="font-medium text-fg">&ldquo;{mergeTarget.label}&rdquo;</span>, then &ldquo;{`${model.brandName} — ${model.name}`}&rdquo; is deleted.
              </p>
              <p>Its colors and cameras are moved too. This can&rsquo;t be undone.</p>
            </>
          )
        }
        confirmLabel="Merge models"
        destructive
        busy={busy}
        onConfirm={() => void handleMerge().then(() => setConfirmingMerge(false))}
      />
    </li>
  );
}

export function ModelsSection() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const searchSeqRef = useRef(0);

  async function runSearch(value: string) {
    setQuery(value);
    const seq = ++searchSeqRef.current;
    if (!value.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await searchModelsAdmin(value);
      if (seq !== searchSeqRef.current) return; // a newer search has since started
      setResults(data);
    } finally {
      if (seq === searchSeqRef.current) setLoading(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-4 sm:px-5">
        <h2 className="text-sm font-semibold text-fg">Models</h2>
        <p className="mt-0.5 text-sm text-fg-muted">
          Search for a model to rename it, or merge a duplicate into another one.
        </p>
      </div>
      <div className="px-4 py-3.5 sm:px-5">
        <Input type="text" placeholder="Search models…" value={query} onChange={(e) => void runSearch(e.target.value)} />
      </div>
      <ul className="divide-y divide-line-soft">
        {loading && <li className="px-4 py-3.5 text-sm text-fg-subtle sm:px-5">Searching…</li>}
        {!loading &&
          results.map((m) => (
            <ModelRowEditor key={m.id} model={m} onChanged={() => void runSearch(query)} />
          ))}
        {!loading && query.trim() && results.length === 0 && (
          <li className="px-4 py-3.5 text-sm text-fg-muted sm:px-5">No matching models.</li>
        )}
      </ul>
    </Card>
  );
}
