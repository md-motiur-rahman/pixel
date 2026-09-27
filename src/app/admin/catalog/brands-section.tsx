"use client";

import { useState } from "react";
import { listAllBrands, renameBrand, mergeBrandsAction, type BrandRow } from "./catalog-actions";
import { Button, Card, Input, Message, Select } from "@/components/ui";

export function BrandsSection({ initialBrands }: { initialBrands: BrandRow[] }) {
  const [brands, setBrands] = useState<BrandRow[]>(initialBrands);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [mergeTarget, setMergeTarget] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const data = await listAllBrands();
    setBrands(data);
  }

  async function handleRename(id: string) {
    const name = drafts[id];
    if (!name || !name.trim()) return;
    setBusyId(id);
    setMessage(null);
    const result = await renameBrand(id, name);
    setBusyId(null);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    await refresh();
  }

  async function handleMerge(sourceId: string) {
    const targetId = mergeTarget[sourceId];
    if (!targetId) return;
    setBusyId(sourceId);
    setMessage(null);
    const result = await mergeBrandsAction(sourceId, targetId);
    setBusyId(null);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    await refresh();
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-neutral-200 px-4 py-4 sm:px-5">
        <h2 className="text-sm font-semibold text-neutral-900">Brands</h2>
        <p className="mt-0.5 text-sm text-neutral-500">Rename a typo, or merge a duplicate into another brand.</p>
      </div>
      {message && <Message variant="error" className="px-4 pt-3 sm:px-5">{message}</Message>}
      <ul className="divide-y divide-neutral-100">
        {brands.map((b) => (
          <li key={b.id} className="space-y-2.5 px-4 py-3.5 sm:px-5">
            <div className="flex gap-2">
              <Input
                type="text"
                defaultValue={b.name}
                onChange={(e) => setDrafts((d) => ({ ...d, [b.id]: e.target.value }))}
                className="max-w-xs"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleRename(b.id)}
                disabled={busyId === b.id || !drafts[b.id] || drafts[b.id] === b.name}
              >
                Save
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-400">merge into</span>
              <Select
                value={mergeTarget[b.id] ?? ""}
                onChange={(e) => setMergeTarget((m) => ({ ...m, [b.id]: e.target.value }))}
                className="min-h-9 w-auto max-w-xs py-1 text-sm"
              >
                <option value="">Select a brand…</option>
                {brands
                  .filter((other) => other.id !== b.id)
                  .map((other) => (
                    <option key={other.id} value={other.id}>
                      {other.name}
                    </option>
                  ))}
              </Select>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleMerge(b.id)}
                disabled={busyId === b.id || !mergeTarget[b.id]}
              >
                Merge
              </Button>
            </div>
          </li>
        ))}
        {brands.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-neutral-500 sm:px-5">No brands yet.</li>
        )}
      </ul>
    </Card>
  );
}
