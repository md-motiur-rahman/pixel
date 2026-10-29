"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { ColorSelect } from "@/components/color-select";
import { ColorPill } from "@/components/color-pill";
import { Button, Card, Field, Input, Message } from "@/components/ui";
import { searchBrands, searchModels } from "@/app/(app)/tester/search-actions";
import { normalizeAsin } from "@/lib/asin";
import { addAsinToModel, addModelEntry, listModelEntries, removeModelAsin, type ModelEntry } from "./actions";

const MAX_ENTRY_ASINS = 10;

export function DataEntryScreen({ initialEntries }: { initialEntries: ModelEntry[] }) {
  const [entries, setEntries] = useState<ModelEntry[]>(initialEntries);
  const [query, setQuery] = useState("");
  const queryRef = useRef("");
  const searchSeqRef = useRef(0);

  // Refetch the list for whatever is typed in the search box (or the latest entries).
  async function refresh(forQuery = queryRef.current) {
    const seq = ++searchSeqRef.current;
    const next = await listModelEntries(forQuery);
    if (seq === searchSeqRef.current) setEntries(next);
  }

  function handleSearch(value: string) {
    setQuery(value);
    queryRef.current = value;
    void refresh(value);
  }

  return (
    <div className="space-y-4">
      <EntryForm onSaved={() => void refresh()} />

      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-4 sm:px-5">
          <h2 className="text-sm font-semibold text-fg">Models &amp; ASINs</h2>
          <p className="mt-0.5 text-sm text-fg-muted">
            {query.trim() ? "Search results" : "Latest entries"} — each colour of a model has its own ASIN(s). Testers
            pick from these when they log a camera of that model and colour.
          </p>
          <div className="relative mt-3">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              type="text"
              placeholder="Search a brand or model…"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <ul className="divide-y divide-line-soft">
          {entries.map((entry) => (
            <ModelRow key={entry.modelId} entry={entry} onChanged={() => void refresh()} />
          ))}
          {entries.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-fg-muted sm:px-5">
              {query.trim() ? "No matching models." : "Nothing entered yet — add the first model above."}
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

function EntryForm({ onSaved }: { onSaved: () => void }) {
  const [brand, setBrand] = useState<ComboboxOption | null>(null);
  const [brandName, setBrandName] = useState("");
  const [model, setModel] = useState<ComboboxOption | null>(null);
  const [modelName, setModelName] = useState("");
  const [color, setColor] = useState("");
  const [asins, setAsins] = useState<string[]>([""]);
  // Bumped to clear the model field when the brand changes.
  const [modelKey, setModelKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const effectiveBrand = brand?.label ?? brandName;
  const effectiveModel = model?.label ?? modelName;
  const filledAsins = asins.filter((a) => a.trim());
  const canSave = Boolean(effectiveBrand && effectiveModel && color && filledAsins.length > 0) && !saving;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const result = await addModelEntry({
        brandId: brand?.id ?? null,
        brandName: effectiveBrand,
        modelId: model?.id ?? null,
        modelName: effectiveModel,
        color,
        asins,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(result.message);
      // Keep the brand and model: the next entry is usually another colour of it.
      setColor("");
      setAsins([""]);
      onSaved();
    } catch {
      setError("Could not save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass space-y-5 rounded-3xl p-5 sm:p-6">
      <div>
        <h2 className="text-sm font-semibold text-fg">Add ASINs for a model &amp; colour</h2>
        <p className="mt-0.5 text-sm text-fg-muted">
          Each colour of a model has its own ASIN(s). Pick the brand, model and colour, then enter its ASIN(s). After
          saving, the model stays selected so you can add the next colour.
        </p>
      </div>

      <Combobox
        label="Brand"
        placeholder="e.g. Canon"
        value={brand}
        onSelect={(opt) => {
          setBrand(opt);
          setModel(null);
          setModelName("");
          setModelKey((k) => k + 1);
        }}
        onCreateNew={(name) => {
          setBrand(null);
          setBrandName(name);
          setModel(null);
          setModelName("");
          setModelKey((k) => k + 1);
        }}
        search={searchBrands}
      />

      <Combobox
        key={`${brand?.id ?? brandName}-${modelKey}`}
        label="Model"
        placeholder="e.g. PowerShot SX220IS"
        disabled={!effectiveBrand}
        value={model}
        onSelect={setModel}
        onCreateNew={(name) => {
          setModel(null);
          setModelName(name);
        }}
        search={(q) => (brand?.id ? searchModels(brand.id, q) : Promise.resolve([]))}
      />

      <Field label="Colour" hint="The ASIN(s) below are for this colour only.">
        <ColorSelect value={color} onValueChange={setColor} disabled={!effectiveModel} />
      </Field>

      <div className="space-y-3">
        {asins.map((value, i) => (
          <Field
            key={i}
            label={i === 0 ? "ASIN" : `ASIN ${i + 1}`}
            hint={i === 0 ? "10 letters or numbers, e.g. B0CHX1W1XY." : undefined}
          >
            <div className="flex gap-2">
              <Input
                type="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={12}
                placeholder="B0XXXXXXXX"
                value={value}
                onChange={(e) => setAsins((prev) => prev.map((v, j) => (j === i ? normalizeAsin(e.target.value) : v)))}
                className="font-mono tracking-wide"
              />
              {i > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove ASIN ${i + 1}`}
                  onClick={() => setAsins((prev) => prev.filter((_, j) => j !== i))}
                  className="px-3"
                >
                  <X aria-hidden="true" />
                </Button>
              )}
            </div>
          </Field>
        ))}
        {asins.length < MAX_ENTRY_ASINS && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setAsins((prev) => [...prev, ""])}>
            <Plus aria-hidden="true" />
            Add another ASIN
          </Button>
        )}
      </div>

      {error && <Message variant="error">{error}</Message>}
      {success && <Message variant="success">{success}</Message>}

      <Button type="submit" disabled={!canSave} className="w-full">
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

// A model's ASINs, one group per colour (older colour-less ones last).
function groupByColour(asins: ModelEntry["asins"]) {
  const groups = new Map<string, { color: string | null; asins: ModelEntry["asins"] }>();
  for (const a of asins) {
    const key = a.color?.toLowerCase() ?? "";
    if (!groups.has(key)) groups.set(key, { color: a.color, asins: [] });
    groups.get(key)!.asins.push(a);
  }
  return [...groups.values()].sort((x, y) =>
    x.color === null ? 1 : y.color === null ? -1 : x.color.localeCompare(y.color)
  );
}

function ModelRow({ entry, onChanged }: { entry: ModelEntry; onChanged: () => void }) {
  const [newAsin, setNewAsin] = useState("");
  const [newColor, setNewColor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear a stale error once the row's ASINs actually change underneath it.
  const asinKey = entry.asins.map((a) => a.id).join(",");
  useEffect(() => {
    const timer = setTimeout(() => setError(null), 0);
    return () => clearTimeout(timer);
  }, [asinKey]);

  async function run(action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      onChanged();
      return true;
    } catch {
      setError("Could not save — check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-2.5 px-4 py-3.5 sm:px-5">
      <div>
        <p className="text-xs text-fg-muted">{entry.brand}</p>
        <p className="text-sm font-medium text-fg">{entry.model}</p>
      </div>

      {entry.asins.length === 0 && <p className="text-xs text-warn">No ASIN yet</p>}
      <div className="space-y-2">
        {groupByColour(entry.asins).map((group) => (
          <div key={group.color ?? ""} className="flex flex-wrap items-center gap-1.5">
            <span className="w-28 shrink-0">
              {group.color ? (
                <ColorPill color={group.color} />
              ) : (
                <span className="text-xs text-fg-subtle" title="Entered before colours were recorded — offered for every colour">
                  Any colour
                </span>
              )}
            </span>
            {group.asins.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-md border border-line bg-glass-soft py-0.5 pr-0.5 pl-1.5 font-mono text-xs text-fg"
              >
                {a.asin}
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remove ${a.asin}${a.color ? ` (${a.color})` : ""}`}
                  onClick={() => void run(() => removeModelAsin(a.id))}
                  className="flex size-5 items-center justify-center rounded text-fg-subtle hover:bg-glass-hover hover:text-danger disabled:opacity-50"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!newAsin.trim() || !newColor) return;
          void run(() => addAsinToModel(entry.modelId, newColor, newAsin)).then((ok) => {
            if (ok) setNewAsin("");
          });
        }}
        className="flex flex-wrap gap-2"
      >
        <div className="w-44">
          <ColorSelect value={newColor} onValueChange={setNewColor} />
        </div>
        <Input
          type="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={12}
          placeholder="Add an ASIN"
          aria-label={`Add an ASIN to ${entry.brand} ${entry.model}`}
          value={newAsin}
          onChange={(e) => setNewAsin(normalizeAsin(e.target.value))}
          className="min-h-9 max-w-52 py-1 font-mono text-sm tracking-wide"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={busy || !newAsin.trim() || !newColor}>
          <Plus aria-hidden="true" />
          Add
        </Button>
      </form>

      {error && <Message variant="error">{error}</Message>}
    </li>
  );
}
