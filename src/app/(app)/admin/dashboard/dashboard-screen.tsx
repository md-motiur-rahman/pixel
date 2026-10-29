"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ClipboardCheck, Hourglass, PoundSterling, RefreshCw, ShoppingBag, Warehouse, Wrench } from "lucide-react";
import { Button, Card, Input, Message } from "@/components/ui";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/cn";
import { loadDashboard, type DashboardData } from "./actions";
import { BarChart, type ChartBucket } from "./bar-chart";

type Period = "today" | "week" | "month" | "custom";

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom" },
];

// The longest custom range — a year of daily events is still quick to load.
const MAX_DAYS = 366;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}
// yyyy-mm-dd in local time, for <input type="date">.
function toDateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fromDateInput(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

// [from, to) in local time. Weeks start on Monday.
function rangeFor(period: Period, customFrom: string, customTo: string): { from: Date; to: Date } | null {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  if (period === "today") return { from: today, to: tomorrow };
  if (period === "week") return { from: addDays(today, -((today.getDay() + 6) % 7)), to: tomorrow };
  if (period === "month") return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: tomorrow };
  const from = fromDateInput(customFrom);
  const to = fromDateInput(customTo);
  if (!from || !to || to < from) return null;
  return { from, to: addDays(to, 1) };
}

const dayLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" });
const longDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

type Unit = "hour" | "day" | "month";

// Hours for a single day, days up to ~3 months, months beyond that.
function bucketsFor(from: Date, to: Date): { unit: Unit; starts: Date[] } {
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  const starts: Date[] = [];
  if (days <= 1) {
    for (let h = 0; h < 24; h++) starts.push(new Date(from.getFullYear(), from.getMonth(), from.getDate(), h));
    return { unit: "hour", starts };
  }
  if (days <= 92) {
    for (let d = from; d < to; d = addDays(d, 1)) starts.push(d);
    return { unit: "day", starts };
  }
  for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    starts.push(d);
  }
  return { unit: "month", starts };
}

function bucketIndex(at: Date, starts: Date[]) {
  // starts is sorted; find the last start <= at.
  let lo = 0;
  let hi = starts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= at) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

function bucketLabel(d: Date, unit: Unit) {
  if (unit === "hour") return `${String(d.getHours()).padStart(2, "0")}:00`;
  if (unit === "day") return dayLabel.format(d);
  return monthLabel.format(d);
}

type Loaded = Extract<DashboardData, { ok: true }>;

export function DashboardScreen() {
  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState(() => toDateInput(addDays(new Date(), -6)));
  const [customTo, setCustomTo] = useState(() => toDateInput(new Date()));
  const [data, setData] = useState<Loaded | null>(null);
  const [loadedRange, setLoadedRange] = useState<{ from: Date; to: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seqRef = useRef(0);

  const range = useMemo(() => rangeFor(period, customFrom, customTo), [period, customFrom, customTo]);
  const rangeError =
    period === "custom" && !range
      ? "Pick a start date and an end date on or after it."
      : range && (range.to.getTime() - range.from.getTime()) / 86_400_000 > MAX_DAYS
        ? `Pick a range of at most ${MAX_DAYS} days.`
        : null;

  const load = useCallback(async () => {
    if (!range || rangeError) return;
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await loadDashboard(range.from.toISOString(), range.to.toISOString());
      if (seq !== seqRef.current) return; // a newer period was picked meanwhile
      if (result.ok) {
        setData(result);
        setLoadedRange(range);
      } else setError(result.error);
    } catch {
      if (seq === seqRef.current) setError("Could not load the dashboard — check your connection and try again.");
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [range, rangeError]);

  useEffect(() => {
    // Loading data for the chosen period is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const view = useMemo(() => {
    if (!data || !loadedRange) return null;
    const { unit, starts } = bucketsFor(loadedRange.from, loadedRange.to);
    const buckets: ChartBucket[] = starts.map((s) => ({
      label: bucketLabel(s, unit),
      title: unit === "hour" ? `${bucketLabel(s, unit)}, ${longDay.format(s)}` : unit === "day" ? longDay.format(s) : bucketLabel(s, unit),
      values: [0, 0],
    }));
    for (const t of data.tested) {
      const i = bucketIndex(new Date(t.at), starts);
      if (i >= 0) buckets[i].values[0]++;
    }
    for (const s of data.sold) {
      const i = bucketIndex(new Date(s.at), starts);
      if (i >= 0) buckets[i].values[1]++;
    }

    const testers = new Map<string, { count: number; grades: Record<string, number> }>();
    for (const t of data.tested) {
      const row = testers.get(t.by) ?? { count: 0, grades: {} };
      row.count++;
      row.grades[t.grade] = (row.grades[t.grade] ?? 0) + 1;
      testers.set(t.by, row);
    }
    const stockers = new Map<string, { count: number; value: number; priced: number }>();
    for (const s of data.sold) {
      const key = s.by ?? "";
      const row = stockers.get(key) ?? { count: 0, value: 0, priced: 0 };
      row.count++;
      if (s.price !== null) {
        row.value += s.price;
        row.priced++;
      }
      stockers.set(key, row);
    }
    const nameOf = (id: string) => (id ? (data.names[id] ?? "Unknown") : "Not recorded");

    const salesValue = data.sold.reduce((sum, s) => sum + (s.price ?? 0), 0);
    const pricedCount = data.sold.filter((s) => s.price !== null).length;

    return {
      unit,
      buckets,
      salesValue,
      pricedCount,
      testers: [...testers.entries()]
        .map(([id, row]) => ({ id, name: nameOf(id), ...row }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      stockers: [...stockers.entries()]
        .map(([id, row]) => ({ id, name: nameOf(id), ...row }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    };
  }, [data, loadedRange]);

  const periodText = !loadedRange
    ? ""
    : period === "today"
      ? "today"
      : `${longDay.format(loadedRange.from)} – ${longDay.format(addDays(loadedRange.to, -1))}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg">Dashboard</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Stock right now, and what was tested and sold {periodText ? <span className="text-fg">{periodText}</span> : "…"}.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading || !!rangeError}>
          <RefreshCw aria-hidden="true" className={cn(loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Period */}
      <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div role="radiogroup" aria-label="Period" className="grid grid-cols-4 gap-1 rounded-2xl bg-glass-soft p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={period === p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "min-h-9 rounded-xl px-3 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60",
                period === p.value ? "bg-accent text-white shadow-sm" : "text-fg-muted hover:bg-glass-hover hover:text-fg"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              From
              <Input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="min-h-9 w-auto py-1 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              to
              <Input
                type="date"
                value={customTo}
                min={customFrom}
                max={toDateInput(new Date())}
                onChange={(e) => setCustomTo(e.target.value)}
                className="min-h-9 w-auto py-1 text-sm"
              />
            </label>
          </div>
        )}
      </Card>

      {rangeError && <Message variant="error">{rangeError}</Message>}
      {error && <Message variant="error">{error}</Message>}

      {/* Headline numbers */}
      <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4 transition-opacity", loading && data && "opacity-60")}>
        <StatTile
          icon={Warehouse}
          tone="bg-accent/10 text-accent"
          label="In inventory now"
          value={data ? String(data.stock.inventory) : "—"}
          detail={
            data
              ? Object.entries(data.stock.byGrade)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([g, n]) => `${g} ${n}`)
                  .join(" · ") || "Nothing in stock"
              : undefined
          }
        />
        <StatTile
          icon={ClipboardCheck}
          tone="bg-accent/10 text-accent"
          label={period === "today" ? "Tested today" : "Tested"}
          value={data ? String(data.tested.length) : "—"}
          detail={view ? `${view.testers.length} tester${view.testers.length === 1 ? "" : "s"}` : undefined}
        />
        <StatTile
          icon={ShoppingBag}
          tone="bg-success-soft text-success"
          label={period === "today" ? "Sold today" : "Sold"}
          value={data ? String(data.sold.length) : "—"}
          detail="Accepted by the master stocker"
        />
        <StatTile
          icon={PoundSterling}
          tone="bg-success-soft text-success"
          label="Sales value"
          value={view ? formatPrice(view.salesValue) : "—"}
          detail={
            view && data
              ? view.pricedCount === data.sold.length
                ? "All with a selling price"
                : `${view.pricedCount} of ${data.sold.length} have a price`
              : undefined
          }
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MiniStat icon={Hourglass} label="On hold" hint="Picked, waiting for the master stocker" value={data?.stock.onHold} />
        <MiniStat icon={Wrench} label="Repair" hint="Grade D" value={data?.stock.repair} />
        <MiniStat icon={Archive} label="Clearance" hint="Grade E" value={data?.stock.clearance} />
      </div>

      {/* Chart */}
      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-fg">
            Tested and sold {view ? (view.unit === "hour" ? "by hour" : view.unit === "day" ? "by day" : "by month") : ""}
          </h2>
          <div className="flex items-center gap-4 text-xs text-fg-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-sm bg-accent" /> Tested
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-sm bg-success" /> Sold
            </span>
          </div>
        </div>
        {view ? (
          <BarChart buckets={view.buckets} series={["Tested", "Sold"]} colors={["bg-accent", "bg-success"]} />
        ) : (
          <div className="h-56 animate-pulse rounded-2xl bg-glass-soft" />
        )}
      </Card>

      {/* Per person */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-fg">Tested by each tester</h2>
          {!view ? (
            <ListSkeleton />
          ) : view.testers.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-muted">No items tested in this period.</p>
          ) : (
            <ul className="space-y-3">
              {view.testers.map((t) => (
                <PersonRow
                  key={t.id}
                  name={t.name}
                  count={t.count}
                  max={view.testers[0].count}
                  barClass="bg-accent"
                  detail={Object.entries(t.grades)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([g, n]) => `${g} ${n}`)
                    .join(" · ")}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-fg">Sold by each master stocker</h2>
          {!view ? (
            <ListSkeleton />
          ) : view.stockers.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-muted">No items accepted in this period.</p>
          ) : (
            <ul className="space-y-3">
              {view.stockers.map((s) => (
                <PersonRow
                  key={s.id || "none"}
                  name={s.name}
                  count={s.count}
                  max={view.stockers[0].count}
                  barClass="bg-success"
                  detail={s.priced > 0 ? `${formatPrice(s.value)} from ${s.priced} priced` : "No prices entered"}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  detail,
}: {
  icon: typeof Warehouse;
  tone: string;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl", tone)}>
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <p className="truncate text-xs font-medium text-fg-muted">{label}</p>
      </div>
      <p className="mt-3 truncate text-2xl font-semibold leading-none tabular-nums text-fg sm:text-3xl">{value}</p>
      <p className="mt-1.5 truncate text-xs text-fg-subtle">{detail ?? " "}</p>
    </Card>
  );
}

function MiniStat({
  icon: Icon,
  label,
  hint,
  value,
}: {
  icon: typeof Warehouse;
  label: string;
  hint: string;
  value: number | undefined;
}) {
  return (
    <Card className="flex items-center gap-3 px-4 py-3" title={hint}>
      <Icon aria-hidden="true" className="hidden size-4 shrink-0 text-fg-subtle sm:block" />
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none tabular-nums text-fg">{value ?? "—"}</p>
        <p className="mt-1 truncate text-xs text-fg-muted">{label}</p>
      </div>
    </Card>
  );
}

function PersonRow({
  name,
  count,
  max,
  barClass,
  detail,
}: {
  name: string;
  count: number;
  max: number;
  barClass: string;
  detail: string;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium text-fg">{name}</span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-fg">{count}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-glass-soft">
        <div className={cn("h-full rounded-full", barClass)} style={{ width: `${max ? (count / max) * 100 : 0}%` }} />
      </div>
      <p className="mt-1 truncate text-xs text-fg-subtle">{detail}</p>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-10 animate-pulse rounded-xl bg-glass-soft" />
      ))}
    </div>
  );
}
