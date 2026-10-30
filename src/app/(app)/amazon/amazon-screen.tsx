"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Copy, History, Printer, Search, Wrench } from "lucide-react";
import Link from "next/link";
import { Badge, Button, Card, Input, Message, Select } from "@/components/ui";
import { ColorPill } from "@/components/color-pill";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CameraScanButton } from "@/components/camera-scan-button";
import { cn } from "@/lib/cn";
import {
  checkAndList,
  listAmazonItems,
  type AmazonFilter,
  type AmazonItem,
  type AmazonList,
  type GradeOption,
} from "./actions";

// How often the open page checks for newly tested items (and when the tab is shown again).
const POLL_MS = 15000;

const FILTERS: { value: AmazonFilter; label: string }[] = [
  { value: "waiting", label: "To list" },
  { value: "listed", label: "Listed" },
];

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function CopyAsin({ asin }: { asin: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(asin).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      title="Copy ASIN"
      className="inline-flex items-center gap-1 rounded-md border border-line bg-glass-soft px-1.5 py-0.5 font-mono text-xs text-fg outline-none transition-colors hover:bg-glass-hover focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      {asin}
      {copied ? (
        <Check aria-hidden="true" className="size-3 text-success" />
      ) : (
        <Copy aria-hidden="true" className="size-3 text-fg-subtle" />
      )}
    </button>
  );
}

function AmazonCard({
  item,
  grades,
  onListed,
}: {
  item: AmazonItem;
  grades: GradeOption[];
  onListed: (unitId: string) => void;
}) {
  const router = useRouter();
  const [gradeId, setGradeId] = useState(item.gradeId);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const chosen = grades.find((g) => g.id === gradeId);
  const regrading = gradeId !== item.gradeId;
  const leavesInventory = regrading && chosen && !chosen.inInventory;
  const waiting = item.listedAt === null && !done;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await checkAndList(item.unitId, gradeId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      if (result.regraded) {
        // New grade → new label straight away.
        router.push(`/label/${item.unitId}?from=amazon&regraded=${encodeURIComponent(result.grade)}`);
        return;
      }
      setDone(true);
      onListed(item.unitId);
    } catch {
      setError("Could not save — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={cn("p-4 sm:p-5", done && "opacity-70")}>
      {/* What it is */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-fg-subtle">{item.brand}</p>
          <h3 className="truncate text-[15px] font-semibold text-fg">{item.model}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ColorPill color={item.color} />
            <Badge tone="neutral" className="normal-case">
              Grade {item.grade}
            </Badge>
            {item.source === "repaired" && (
              <Badge tone="warning" className="normal-case">
                <Wrench aria-hidden="true" className="size-3" /> Repaired
              </Badge>
            )}
            {!item.inStock && (
              <Badge tone="neutral" className="normal-case">
                Already picked
              </Badge>
            )}
          </div>
        </div>
        <Link
          href={`/label/${item.unitId}?from=amazon`}
          title="Print label"
          aria-label={`Print label for ${item.brand} ${item.model}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl text-fg-subtle ring-1 ring-line transition-colors ring-inset hover:bg-glass-hover hover:text-fg"
        >
          <Printer aria-hidden="true" className="size-4" />
        </Link>
      </div>

      {/* Details */}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-fg-subtle">ASIN</dt>
        <dd className="flex flex-wrap gap-1">
          {item.asins.length ? item.asins.map((a) => <CopyAsin key={a} asin={a} />) : <span className="text-warn">None yet</span>}
        </dd>
        <dt className="text-fg-subtle">Serial</dt>
        <dd className="font-mono text-fg">{item.serialNumber ?? <span className="font-sans text-fg-subtle">—</span>}</dd>
        <dt className="text-fg-subtle">Tested</dt>
        <dd className="text-fg-muted">
          {when(item.testedAt)}
          {item.testerName ? ` · ${item.testerName}` : ""}
        </dd>
        {item.note && (
          <>
            <dt className="text-fg-subtle">Note</dt>
            <dd className="text-fg-muted">{item.note}</dd>
          </>
        )}
        {item.listedAt && (
          <>
            <dt className="text-fg-subtle">Listed</dt>
            <dd className="text-fg-muted">
              {when(item.listedAt)}
              {item.listedByName ? ` · ${item.listedByName}` : ""}
            </dd>
          </>
        )}
      </dl>

      {item.gradeHistory.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl bg-glass-soft px-3 py-2">
          {item.gradeHistory.map((h, i) => (
            <li key={i} className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
              <History aria-hidden="true" className="size-3 text-fg-subtle" />
              <span className="font-medium text-fg">{h.from}</span>
              <ArrowRight aria-hidden="true" className="size-3 text-fg-subtle" />
              <span className="font-medium text-fg">{h.to}</span>
              <span className="text-fg-subtle">
                · {when(h.at)}
                {h.byName ? ` · ${h.byName}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Check & list */}
      {waiting && (
        <div className="mt-4 flex flex-col gap-2 border-t border-line-soft pt-4 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-xs font-medium text-fg-muted sm:w-56">
            <span className="shrink-0">Grade</span>
            <Select
              value={gradeId}
              onChange={(e) => setGradeId(e.target.value)}
              disabled={busy || !item.inStock}
              className="min-h-10 py-1.5 text-sm"
            >
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </Select>
          </label>
          <Button
            type="button"
            className="sm:ml-auto"
            disabled={busy}
            onClick={() => (regrading ? setConfirming(true) : void submit())}
          >
            <Check aria-hidden="true" />
            {busy ? "Saving…" : regrading ? `Regrade to ${chosen?.code} & save` : "Checked & listed"}
          </Button>
        </div>
      )}
      {done && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-success">
          <Check aria-hidden="true" className="size-3.5" /> Listed
        </p>
      )}
      {error && !confirming && (
        <Message variant="error" className="mt-3">
          {error}
        </Message>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Regrade ${item.grade} → ${chosen?.code}?`}
        description={
          <>
            <p>
              {item.brand} {item.model} ({item.color}) moves from Grade {item.grade} to {chosen?.label}. The change is
              logged with your name, and the inventory counts update.
            </p>
            {leavesInventory ? (
              <p>
                That grade isn&rsquo;t sold through the inventory, so it won&rsquo;t be listed — it moves to{" "}
                {chosen?.code === "D" ? "Repair" : "Clearance"}.
              </p>
            ) : (
              <p>It&rsquo;s then marked as listed on Amazon.</p>
            )}
            <p>Next you&rsquo;ll print its new label — stick it over the old one.</p>
          </>
        }
        confirmLabel="Regrade & print label"
        busy={busy}
        error={error}
        onConfirm={() => void submit()}
      />
    </Card>
  );
}

export function AmazonScreen({ initial, grades }: { initial: AmazonList; grades: GradeOption[] }) {
  const [filter, setFilter] = useState<AmazonFilter>("waiting");
  const [data, setData] = useState<AmazonList>(initial);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const filterRef = useRef(filter);

  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  function load(next: AmazonFilter) {
    setFilter(next);
    startTransition(async () => {
      try {
        setData(await listAmazonItems(next));
      } catch {
        setData({ ok: false, error: "Could not load — check your connection and try again." });
      }
    });
  }

  // New items show up without a reload. Items just listed on this screen stay
  // (ticked) until the tab is changed, instead of vanishing under the cursor.
  const refreshQuietly = useCallback(async () => {
    const requested = filterRef.current;
    try {
      const latest = await listAmazonItems(requested);
      if (!latest.ok || filterRef.current !== requested) return;
      setData((current) => {
        if (!current.ok || requested !== "waiting") return latest;
        const fresh = new Set(latest.items.map((i) => i.unitId));
        const kept = current.items.filter((i) => i.listedAt !== null && !fresh.has(i.unitId));
        return { ...latest, items: [...latest.items, ...kept] };
      });
    } catch {
      // Offline or a hiccup — try again on the next tick.
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) void refreshQuietly();
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
    };
  }, [refreshQuietly]);

  function handleListed(unitId: string) {
    setData((current) =>
      current.ok
        ? {
            ...current,
            waitingCount: Math.max(0, current.waitingCount - 1),
            items: current.items.map((i) => (i.unitId === unitId ? { ...i, listedAt: new Date().toISOString() } : i)),
          }
        : current
    );
  }

  const shown = useMemo(() => {
    if (!data.ok) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.items;
    return data.items.filter((i) =>
      `${i.unitId} ${i.brand} ${i.model} ${i.color} ${i.serialNumber ?? ""} ${i.asins.join(" ")} grade ${i.grade}`
        .toLowerCase()
        .includes(q)
    );
  }, [data, query]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-fg">Amazon listing</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          Every item a tester saves — and every repaired item — waits here. Check it, change the grade if it&rsquo;s
          wrong (a new label prints), then mark it listed.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="tablist" aria-label="Show" className="glass grid grid-cols-2 gap-1 rounded-2xl p-1 sm:inline-grid">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => load(f.value)}
              className={cn(
                "flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-4 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60",
                filter === f.value ? "bg-accent/12 text-accent" : "text-fg-muted hover:bg-glass-hover hover:text-fg"
              )}
            >
              {f.label}
              {f.value === "waiting" && data.ok && data.waitingCount > 0 && (
                <span className="rounded-full bg-accent/15 px-1.5 text-[11px] tabular-nums">{data.waitingCount}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-wrap gap-2 sm:flex-nowrap">
          <div className="relative min-w-0 basis-full sm:basis-auto sm:flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              type="search"
              name="amazon-search"
              autoComplete="off"
              aria-label="Search"
              placeholder="Search model, serial, ASIN…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-10 py-1.5 pl-9 text-sm"
            />
          </div>
          <CameraScanButton onScan={(value) => setQuery(value.trim())} />
        </div>
      </div>

      {!data.ok && <Message variant="error">{data.error}</Message>}

      {data.ok && (
        <div className={cn("space-y-3 transition-opacity", pending && "opacity-60")}>
          {shown.map((item) => (
            <AmazonCard key={item.unitId} item={item} grades={grades} onListed={handleListed} />
          ))}
          {shown.length === 0 && (
            <Card className="px-4 py-10 text-center text-sm text-fg-muted">
              {query
                ? "No matches."
                : filter === "waiting"
                  ? "Nothing to list — every tested item has been listed."
                  : "Nothing listed yet."}
            </Card>
          )}
          {data.limited && (
            <p className="text-center text-xs text-fg-subtle">Showing the first {data.items.length} items.</p>
          )}
        </div>
      )}
    </div>
  );
}
