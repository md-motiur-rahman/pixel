"use client";

import { useMemo, useRef, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { ArrowLeft, ChevronRight, CopyCheck, MoreHorizontal, Pencil, Search } from "lucide-react";
import { Button, Card, Field, Input, Message, Select } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StaffDialog } from "../staff-ui";
import { cn } from "@/lib/cn";
import {
  listBrandsWithCounts,
  listColoursForModel,
  listModelsForBrand,
  mergeBrandsAction,
  mergeModelsAction,
  mergeVariantsAction,
  renameBrand,
  renameModel,
  renameVariant,
  type CatalogItem,
} from "./catalog-actions";

type Level = "brand" | "model" | "colour";
type Result = { ok: true } | { ok: false; error: string };

// Words used for each level, so every message reads naturally.
const WORDS: Record<Level, { one: string; plural: string; countLabel: (n: number) => string }> = {
  brand: { one: "brand", plural: "Brands", countLabel: (n) => `${n} model${n === 1 ? "" : "s"}` },
  model: { one: "model", plural: "Models", countLabel: (n) => `${n} colour${n === 1 ? "" : "s"}` },
  colour: { one: "colour", plural: "Colours", countLabel: (n) => `${n} in stock` },
};

const RENAME: Record<Level, (id: string, name: string) => Promise<Result>> = {
  brand: renameBrand,
  model: renameModel,
  colour: renameVariant,
};
const MERGE: Record<Level, (sourceId: string, targetId: string) => Promise<Result>> = {
  brand: mergeBrandsAction,
  model: mergeModelsAction,
  colour: mergeVariantsAction,
};

// What moves when a duplicate is combined into the right one.
const MOVES: Record<Level, string> = {
  brand: "all its models, colours, cameras and ASINs",
  model: "all its colours, cameras and ASINs",
  colour: "all its cameras, stock and ASINs",
};

const menuItemClass =
  "flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-fg outline-none transition-colors data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-glass-hover [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-subtle";

// ── One column of the browser ─────────────────────────────────────────
function Column({
  level,
  title,
  items,
  loading,
  selectedId,
  onSelect,
  onRename,
  onDuplicate,
  onBack,
  emptyText,
  className,
}: {
  level: Level;
  title: string;
  items: CatalogItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect?: (item: CatalogItem) => void;
  onRename: (item: CatalogItem) => void;
  onDuplicate: (item: CatalogItem) => void;
  onBack?: () => void;
  emptyText: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((item) => item.name.toLowerCase().includes(q)) : items;
  }, [items, query]);

  return (
    <Card className={cn("flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="space-y-3 border-b border-line-soft p-4">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button type="button" size="sm" variant="ghost" onClick={onBack} aria-label="Back" className="size-8 px-0 lg:hidden">
              <ArrowLeft aria-hidden="true" />
            </Button>
          )}
          <h2 className="min-w-0 truncate text-sm font-semibold text-fg">{title}</h2>
          <span className="ml-auto shrink-0 text-xs tabular-nums text-fg-subtle">{items.length}</span>
        </div>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            type="search"
            name={`catalog-${level}-search`}
            autoComplete="off"
            aria-label={`Search ${WORDS[level].plural.toLowerCase()}`}
            placeholder={`Search ${WORDS[level].plural.toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-9 py-1 pl-9 text-sm"
          />
        </div>
      </div>

      <ul className="max-h-[60dvh] min-h-0 flex-1 divide-y divide-line-soft overflow-y-auto">
        {loading && <li className="px-4 py-6 text-center text-sm text-fg-subtle">Loading…</li>}
        {!loading &&
          shown.map((item) => {
            const selected = item.id === selectedId;
            return (
              <li
                key={item.id}
                className={cn("flex items-center gap-1 pr-2 transition-colors", selected ? "bg-accent/10" : "hover:bg-glass-soft")}
              >
                <button
                  type="button"
                  disabled={!onSelect}
                  onClick={() => onSelect?.(item)}
                  aria-current={selected ? "true" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-2 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-inset disabled:cursor-default"
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", selected ? "font-semibold text-fg" : "text-fg")}>
                      {item.name}
                    </span>
                    <span className="block text-xs text-fg-subtle">{WORDS[level].countLabel(item.count)}</span>
                  </span>
                  {onSelect && (
                    <ChevronRight aria-hidden="true" className={cn("size-4 shrink-0", selected ? "text-accent" : "text-fg-subtle")} />
                  )}
                </button>

                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <Button type="button" size="sm" variant="ghost" aria-label={`Options for ${item.name}`} className="size-8 shrink-0 px-0">
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      sideOffset={6}
                      collisionPadding={12}
                      className="glass-strong z-50 min-w-60 rounded-2xl p-1.5 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95"
                    >
                      <DropdownMenu.Item className={menuItemClass} onSelect={() => onRename(item)}>
                        <Pencil aria-hidden="true" />
                        Rename
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className={menuItemClass} disabled={items.length < 2} onSelect={() => onDuplicate(item)}>
                        <CopyCheck aria-hidden="true" />
                        This is a duplicate of…
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </li>
            );
          })}
        {!loading && shown.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-fg-subtle">{query.trim() ? "No matches." : emptyText}</li>
        )}
      </ul>
    </Card>
  );
}

// ── The page ─────────────────────────────────────────────────────────
export function CatalogBrowser({ initialBrands }: { initialBrands: CatalogItem[] }) {
  const [brands, setBrands] = useState(initialBrands);
  const [models, setModels] = useState<CatalogItem[]>([]);
  const [colours, setColours] = useState<CatalogItem[]>([]);
  const [brand, setBrand] = useState<CatalogItem | null>(null);
  const [model, setModel] = useState<CatalogItem | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingColours, setLoadingColours] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const seq = useRef({ models: 0, colours: 0 });

  // Rename / duplicate dialogs.
  const [renaming, setRenaming] = useState<{ level: Level; item: CatalogItem } | null>(null);
  const [newName, setNewName] = useState("");
  const [duplicate, setDuplicate] = useState<{ level: Level; item: CatalogItem } | null>(null);
  const [keepId, setKeepId] = useState("");
  const [confirmingMerge, setConfirmingMerge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  async function loadModels(brandId: string) {
    const s = ++seq.current.models;
    setLoadingModels(true);
    try {
      const list = await listModelsForBrand(brandId);
      if (s === seq.current.models) setModels(list);
    } finally {
      if (s === seq.current.models) setLoadingModels(false);
    }
  }

  async function loadColours(modelId: string) {
    const s = ++seq.current.colours;
    setLoadingColours(true);
    try {
      const list = await listColoursForModel(modelId);
      if (s === seq.current.colours) setColours(list);
    } finally {
      if (s === seq.current.colours) setLoadingColours(false);
    }
  }

  function selectBrand(item: CatalogItem) {
    setBrand(item);
    setModel(null);
    setColours([]);
    setNotice(null);
    void loadModels(item.id);
  }

  function selectModel(item: CatalogItem) {
    setModel(item);
    setNotice(null);
    void loadColours(item.id);
  }

  // Re-read everything currently on screen after a change.
  async function refreshAll() {
    const freshBrands = await listBrandsWithCounts();
    setBrands(freshBrands);
    const stillBrand = brand && freshBrands.find((b) => b.id === brand.id);
    if (!stillBrand) {
      setBrand(null);
      setModel(null);
      setModels([]);
      setColours([]);
      return;
    }
    setBrand(stillBrand);
    const freshModels = await listModelsForBrand(stillBrand.id);
    setModels(freshModels);
    const stillModel = model && freshModels.find((m) => m.id === model.id);
    if (!stillModel) {
      setModel(null);
      setColours([]);
      return;
    }
    setModel(stillModel);
    setColours(await listColoursForModel(stillModel.id));
  }

  const siblings = (level: Level) => (level === "brand" ? brands : level === "model" ? models : colours);

  function openRename(level: Level, item: CatalogItem) {
    setRenaming({ level, item });
    setNewName(item.name);
    setDialogError(null);
  }

  function openDuplicate(level: Level, item: CatalogItem) {
    setDuplicate({ level, item });
    setKeepId("");
    setDialogError(null);
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renaming) return;
    setBusy(true);
    setDialogError(null);
    try {
      const result = await RENAME[renaming.level](renaming.item.id, newName);
      if (!result.ok) {
        setDialogError(result.error);
        return;
      }
      setNotice(`Renamed “${renaming.item.name}” to “${newName.trim()}”.`);
      setRenaming(null);
      await refreshAll();
    } catch {
      setDialogError("Could not save — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitMerge() {
    if (!duplicate || !keepId) return;
    const keep = siblings(duplicate.level).find((s) => s.id === keepId);
    setBusy(true);
    setDialogError(null);
    try {
      const result = await MERGE[duplicate.level](duplicate.item.id, keepId);
      if (!result.ok) {
        setDialogError(result.error);
        return;
      }
      setNotice(`“${duplicate.item.name}” was combined into “${keep?.name ?? "the one you kept"}”.`);
      setConfirmingMerge(false);
      setDuplicate(null);
      await refreshAll();
    } catch {
      setDialogError("Could not combine them — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const keepItem = duplicate ? siblings(duplicate.level).find((s) => s.id === keepId) : undefined;
  const scope =
    duplicate?.level === "model" && brand ? ` under ${brand.name}` : duplicate?.level === "colour" && model ? ` of ${model.name}` : "";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Catalog</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          Fix spelling mistakes and duplicates in brands, models and colours. Click a brand to see its models, then a
          model to see its colours. Use <span className="font-medium text-fg">…</span> on any line to rename it, or to
          mark it as a duplicate so everything moves to the right one.
        </p>
      </div>

      {notice && <Message variant="success">{notice}</Message>}

      {/* Desktop: three columns side by side. Phone: one column at a time. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Column
          level="brand"
          title="Brands"
          items={brands}
          loading={false}
          selectedId={brand?.id ?? null}
          onSelect={selectBrand}
          onRename={(item) => openRename("brand", item)}
          onDuplicate={(item) => openDuplicate("brand", item)}
          emptyText="No brands yet."
          className={cn(brand ? "hidden lg:flex" : "flex")}
        />
        <Column
          level="model"
          title={brand ? `${brand.name} models` : "Models"}
          items={models}
          loading={loadingModels}
          selectedId={model?.id ?? null}
          onSelect={selectModel}
          onRename={(item) => openRename("model", item)}
          onDuplicate={(item) => openDuplicate("model", item)}
          onBack={() => {
            setBrand(null);
            setModel(null);
          }}
          emptyText={brand ? "This brand has no models." : "Pick a brand to see its models."}
          className={cn(brand && !model ? "flex" : "hidden lg:flex")}
        />
        <Column
          level="colour"
          title={model ? `${model.name} colours` : "Colours"}
          items={colours}
          loading={loadingColours}
          selectedId={null}
          onRename={(item) => openRename("colour", item)}
          onDuplicate={(item) => openDuplicate("colour", item)}
          onBack={() => setModel(null)}
          emptyText={model ? "This model has no colours yet." : "Pick a model to see its colours."}
          className={cn(model ? "flex" : "hidden lg:flex")}
        />
      </div>

      {/* Rename */}
      <StaffDialog
        open={renaming !== null}
        onOpenChange={(open) => !open && !busy && setRenaming(null)}
        title={renaming ? `Rename ${WORDS[renaming.level].one}` : "Rename"}
        description={renaming ? `Changes “${renaming.item.name}” everywhere it's used.` : undefined}
      >
        <form onSubmit={submitRename} className="space-y-4">
          <Field label="New name">
            <Input
              type="text"
              name="catalog-new-name"
              autoComplete="off"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </Field>
          {dialogError && <Message variant="error">{dialogError}</Message>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !newName.trim() || newName.trim() === renaming?.item.name}>
              {busy ? "Saving…" : "Save name"}
            </Button>
          </div>
        </form>
      </StaffDialog>

      {/* Duplicate: pick the one to keep */}
      <StaffDialog
        open={duplicate !== null && !confirmingMerge}
        onOpenChange={(open) => !open && !busy && setDuplicate(null)}
        title={duplicate ? `“${duplicate.item.name}” is a duplicate` : "Duplicate"}
        description={
          duplicate
            ? `Pick the correct ${WORDS[duplicate.level].one}${scope} to keep. Everything moves there and “${duplicate.item.name}” is removed.`
            : undefined
        }
      >
        {duplicate && (
          <div className="space-y-4">
            <Field label={`Keep this ${WORDS[duplicate.level].one}`}>
              <Select value={keepId} onChange={(e) => setKeepId(e.target.value)}>
                <option value="">Choose…</option>
                {siblings(duplicate.level)
                  .filter((s) => s.id !== duplicate.item.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({WORDS[duplicate.level].countLabel(s.count)})
                    </option>
                  ))}
              </Select>
            </Field>
            {keepItem && (
              <div className="rounded-2xl border border-line-soft bg-glass-soft p-3 text-sm text-fg-muted">
                <p>
                  <span className="font-medium text-danger line-through">{duplicate.item.name}</span>
                  {"  →  "}
                  <span className="font-medium text-fg">{keepItem.name}</span>
                </p>
                <p className="mt-1">Moves {MOVES[duplicate.level]}.</p>
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setDuplicate(null)}>
                Cancel
              </Button>
              <Button type="button" disabled={!keepId} onClick={() => setConfirmingMerge(true)}>
                Continue
              </Button>
            </div>
          </div>
        )}
      </StaffDialog>

      <ConfirmDialog
        open={confirmingMerge}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmingMerge(false);
            setDialogError(null);
          }
        }}
        title="Combine them?"
        description={
          duplicate &&
          keepItem && (
            <>
              <p>
                Everything in <span className="font-medium text-fg">“{duplicate.item.name}”</span> — {MOVES[duplicate.level]}{" "}
                — moves to <span className="font-medium text-fg">“{keepItem.name}”</span>, then “{duplicate.item.name}” is
                removed.
              </p>
              <p>This can&rsquo;t be undone.</p>
            </>
          )
        }
        confirmLabel="Combine"
        destructive
        busy={busy}
        error={dialogError}
        onConfirm={() => void submitMerge()}
      />
    </div>
  );
}
