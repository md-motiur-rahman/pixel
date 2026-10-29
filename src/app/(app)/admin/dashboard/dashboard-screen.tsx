"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  ClipboardCheck,
  Hourglass,
  Minus,
  PoundSterling,
  RefreshCw,
  ShoppingBag,
  Tag,
  Warehouse,
  Wrench,
} from "lucide-react";
import { Card, Input, Message } from "@/components/ui";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/cn";
import { loadDashboard, type DashboardData } from "./actions";
import { BarChart, type ChartBucket } from "./bar-chart";

type Period = "today" | "week" | "month" | "custom";
type Range = { from: Date; to: Date };

const PERIODS: { value: Period; label: string; short: string }[] = [
  { value: "today", label: "Today", short: "Today" },
  { value: "week", label: "This week", short: "Week" },
  { value: "month", label: "This month", short: "Month" },
  { value: "custom", label: "Custom", short: "Custom" },
];

const COMPARED_TO: Record<Period, string> = {
  today: "vs yesterday",
  week: "vs last week",
  month: "vs last month",
  custom: "vs previous period",
};

// The longest custom range — a year of daily events is still quick to load.
const MAX_DAYS = 366;

// Soft, theme-aware fills — the strong accent colours at a calmer strength.
const TESTED_FILL = "bg-accent/75";
const SOLD_FILL = "bg-success/70";
const GRADE_FILLS = ["bg-accent/80", "bg-accent/50", "bg-accent/30", "bg-accent/20"];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}
function daysBetween(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
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
function rangeFor(period: Period, customFrom: string, customTo: string): Range | null {
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

// The same stretch of time just before: yesterday, the same days of last week,
// the same dates of last month, or an equally long run of days.
function previousRange(period: Period, range: Range): Range {
  const days = daysBetween(range.from, range.to);
  if (period === "month") {
    const from = new Date(range.from.getFullYear(), range.from.getMonth() - 1, 1);
    const monthEnd = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
    const to = addDays(from, days);
    return { from, to: to < monthEnd ? to : monthEnd };
  }
  return { from: addDays(range.from, -days), to: range.from };
}

const dayLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" });
const longDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

type Unit = "hour" | "day" | "month";

// Hours for a single day, days up to ~3 months, months beyond that.
function bucketsFor(from: Date, to: Date): { unit: Unit; starts: Date[] } {
  const days = daysBetween(from, to);
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

// starts is sorted; the last start <= at, or -1.
function bucketIndex(at: Date, starts: Date[]) {
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

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

type Loaded = Extract<DashboardData, { ok: true }>;
type Totals = { tested: number; sold: number; value: number; priced: number };

function totalsOf(d: Loaded): Totals {
  const priced = d.sold.filter((s) => s.price !== null);
  return {
    tested: d.tested.length,
    sold: d.sold.length,
    value: priced.reduce((sum, s) => sum + (s.price ?? 0), 0),
    priced: priced.length,
  };
}

export function DashboardScreen() {
  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState(() => toDateInput(addDays(new Date(), -6)));
  const [customTo, setCustomTo] = useState(() => toDateInput(new Date()));
  const [data, setData] = useState<Loaded | null>(null);
  const [previous, setPrevious] = useState<Totals | null>(null);
  const [loaded, setLoaded] = useState<{ range: Range; period: Period } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState<{ tested: boolean; sold: boolean }>({ tested: false, sold: false });
  const seqRef = useRef(0);

  const range = useMemo(() => rangeFor(period, customFrom, customTo), [period, customFrom, customTo]);
  const rangeError =
    period === "custom" && !range
      ? "Pick a start date and an end date on or after it."
      : range && daysBetween(range.from, range.to) > MAX_DAYS
        ? `Pick a range of at most ${MAX_DAYS} days.`
        : null;

  const load = useCallback(async () => {
    if (!range || rangeError) return;
    const seq = ++seqRef.current;
    const prev = previousRange(period, range);
    setLoading(true);
    setError(null);
    try {
      const [current, before] = await Promise.all([
        loadDashboard(range.from.toISOString(), range.to.toISOString()),
        loadDashboard(prev.from.toISOString(), prev.to.toISOString()),
      ]);
      if (seq !== seqRef.current) return; // a newer period was picked meanwhile
      if (current.ok) {
        setData(current);
        setPrevious(before.ok ? totalsOf(before) : null);
        setLoaded({ range, period });
      } else setError(current.error);
    } catch {
      if (seq === seqRef.current) setError("Could not load the dashboard — check your connection and try again.");
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [range, rangeError, period]);

  useEffect(() => {
    // Loading data for the chosen period is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const view = useMemo(() => {
    if (!data || !loaded) return null;
    const { unit, starts } = bucketsFor(loaded.range.from, loaded.range.to);
    const buckets: ChartBucket[] = starts.map((s) => ({
      label: bucketLabel(s, unit),
      title:
        unit === "hour"
          ? `${bucketLabel(s, unit)}, ${longDay.format(s)}`
          : unit === "day"
            ? longDay.format(s)
            : bucketLabel(s, unit),
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
    const byCount = (a: { count: number; name: string }, b: { count: number; name: string }) =>
      b.count - a.count || a.name.localeCompare(b.name);

    return {
      unit,
      buckets,
      totals: totalsOf(data),
      testers: [...testers.entries()].map(([id, row]) => ({ id, name: nameOf(id), ...row })).sort(byCount),
      stockers: [...stockers.entries()].map(([id, row]) => ({ id, name: nameOf(id), ...row })).sort(byCount),
    };
  }, [data, loaded]);

  const rangeText = !loaded
    ? "Loading…"
    : daysBetween(loaded.range.from, loaded.range.to) === 1
      ? longDay.format(loaded.range.from)
      : `${dayLabel.format(loaded.range.from)} – ${longDay.format(addDays(loaded.range.to, -1))}`;
  const compared = loaded ? COMPARED_TO[loaded.period] : "";
  const busy = loading && Boolean(data);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-6 sm:space-y-5">
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-fg sm:text-xl">Dashboard</h1>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-fg-muted">
            <CalendarRange aria-hidden="true" className="size-3.5 shrink-0 text-fg-subtle" />
            {rangeText}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || !!rangeError}
          aria-label="Refresh"
          title="Refresh"
          className="glass flex size-10 shrink-0 items-center justify-center rounded-2xl text-fg-muted ring-1 ring-line ring-inset outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50"
        >
          <RefreshCw aria-hidden="true" className={cn("size-4", loading && "animate-spin")} />
        </button>
      </header>

      {/* Period */}
      <div className="space-y-2">
        <div role="radiogroup" aria-label="Period" className="glass grid grid-cols-4 gap-1 rounded-2xl p-1 sm:inline-grid">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={period === p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "min-h-9 rounded-xl px-2 text-[13px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 sm:px-4",
                period === p.value ? "bg-accent/12 text-accent" : "text-fg-muted hover:bg-glass-hover hover:text-fg"
              )}
            >
              <span className="sm:hidden">{p.short}</span>
              <span className="hidden sm:inline">{p.label}</span>
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end sm:gap-3">
            <label className="block text-xs font-medium text-fg-muted">
              From
              <Input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="mt-1 min-h-10 py-1.5 text-sm sm:w-44"
              />
            </label>
            <label className="block text-xs font-medium text-fg-muted">
              To
              <Input
                type="date"
                value={customTo}
                min={customFrom}
                max={toDateInput(new Date())}
                onChange={(e) => setCustomTo(e.target.value)}
                className="mt-1 min-h-10 py-1.5 text-sm sm:w-44"
              />
            </label>
          </div>
        )}
      </div>

      {rangeError && <Message variant="error">{rangeError}</Message>}
      {error && <Message variant="error">{error}</Message>}

      <div className={cn("space-y-4 transition-opacity sm:space-y-5", busy && "opacity-60")}>
        {/* Stock + headline numbers */}
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-5">
          <StockCard data={data} className="lg:col-span-2" />

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-3">
            <Kpi
              icon={ClipboardCheck}
              tone="text-accent bg-accent/10"
              label="Tested"
              value={view ? String(view.totals.tested) : null}
              now={view?.totals.tested}
              before={previous?.tested}
              compared={compared}
            />
            <Kpi
              icon={ShoppingBag}
              tone="text-success bg-success-soft"
              label="Sold"
              value={view ? String(view.totals.sold) : null}
              now={view?.totals.sold}
              before={previous?.sold}
              compared={compared}
            />
            <Kpi
              icon={PoundSterling}
              tone="text-success bg-success-soft"
              label="Sales value"
              value={view ? formatPrice(view.totals.value) : null}
              now={view?.totals.value}
              before={previous?.value}
              compared={compared}
              footnote={
                view && view.totals.sold > view.totals.priced
                  ? `${view.totals.priced} of ${view.totals.sold} priced`
                  : undefined
              }
            />
            <Kpi
              icon={Tag}
              tone="text-warn bg-warn-soft"
              label="Avg. selling price"
              value={view ? (view.totals.priced ? formatPrice(view.totals.value / view.totals.priced) : "—") : null}
              now={view && view.totals.priced ? view.totals.value / view.totals.priced : undefined}
              before={previous && previous.priced ? previous.value / previous.priced : undefined}
              compared={compared}
            />
          </div>
        </div>

        {/* Chart */}
        <Card className="p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-fg">Activity</h2>
              <p className="mt-0.5 text-xs text-fg-subtle">
                Tested and sold {view ? (view.unit === "hour" ? "per hour" : view.unit === "day" ? "per day" : "per month") : ""}
              </p>
            </div>
            <div className="flex gap-2" role="group" aria-label="Show on chart">
              {/* At least one series always stays on. */}
              <SeriesToggle
                label="Tested"
                total={view?.totals.tested}
                color={TESTED_FILL}
                on={!hidden.tested}
                onToggle={() => setHidden((h) => ({ tested: !h.tested, sold: h.tested ? h.sold : false }))}
              />
              <SeriesToggle
                label="Sold"
                total={view?.totals.sold}
                color={SOLD_FILL}
                on={!hidden.sold}
                onToggle={() => setHidden((h) => ({ sold: !h.sold, tested: h.sold ? h.tested : false }))}
              />
            </div>
          </div>
          {view ? (
            <BarChart
              buckets={view.buckets}
              series={[
                { name: "Tested", color: TESTED_FILL, hidden: hidden.tested },
                { name: "Sold", color: SOLD_FILL, hidden: hidden.sold },
              ]}
            />
          ) : (
            <div className="h-60 animate-pulse rounded-2xl bg-glass-soft sm:h-76" />
          )}
        </Card>

        {/* Per person */}
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          <Leaderboard
            title="Testers"
            subtitle="Items tested"
            empty="No items tested in this period."
            fill={TESTED_FILL}
            rows={view?.testers.map((t) => ({
              id: t.id,
              name: t.name,
              count: t.count,
              detail: Object.entries(t.grades)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([g, n]) => `${g} ${n}`)
                .join(" · "),
            }))}
          />
          <Leaderboard
            title="Master stockers"
            subtitle="Items sold"
            empty="No items accepted in this period."
            fill={SOLD_FILL}
            rows={view?.stockers.map((s) => ({
              id: s.id || "none",
              name: s.name,
              count: s.count,
              detail: s.priced > 0 ? `${formatPrice(s.value)} · ${s.priced} priced` : "No prices entered",
            }))}
          />
        </div>
      </div>
    </div>
  );
}

function StockCard({ data, className }: { data: Loaded | null; className?: string }) {
  const grades = data ? Object.entries(data.stock.byGrade).sort(([a], [b]) => a.localeCompare(b)) : [];
  const total = data?.stock.inventory ?? 0;
  const fillFor = (i: number) => GRADE_FILLS[Math.min(i, GRADE_FILLS.length - 1)];

  return (
    <Card className={cn("flex flex-col p-4 sm:p-5", className)}>
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Warehouse aria-hidden="true" className="size-[18px]" />
        </span>
        <div>
          <p className="text-[13px] font-medium text-fg-muted">In inventory</p>
          <p className="text-[11px] text-fg-subtle">Right now, any period</p>
        </div>
      </div>

      {data ? (
        <p className="mt-4 text-4xl font-semibold tracking-tight tabular-nums text-fg">{total.toLocaleString("en-GB")}</p>
      ) : (
        <div className="mt-4 h-10 w-24 animate-pulse rounded-lg bg-glass-soft" />
      )}

      {/* Split by grade */}
      <div className="mt-4">
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-glass-soft">
          {total > 0 &&
            grades.map(([g, n], i) =>
              n > 0 ? (
                <div
                  key={g}
                  className={cn("h-full transition-[width] duration-500", fillFor(i))}
                  style={{ width: `${(n / total) * 100}%` }}
                />
              ) : null
            )}
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
          {grades.map(([g, n], i) => (
            <li key={g} className="flex items-center gap-1.5 text-xs text-fg-muted">
              <span aria-hidden="true" className={cn("size-2 rounded-full", fillFor(i))} />
              Grade {g} <span className="font-semibold tabular-nums text-fg">{n}</span>
            </li>
          ))}
          {data && grades.length === 0 && <li className="text-xs text-fg-subtle">Nothing in stock</li>}
        </ul>
      </div>

      {/* Not part of the inventory count */}
      <div className="mt-auto grid grid-cols-3 gap-2 pt-5">
        <SideStat icon={Hourglass} label="On hold" value={data?.stock.onHold} title="Picked, waiting for the master stocker" />
        <SideStat icon={Wrench} label="Repair" value={data?.stock.repair} title="Grade D" />
        <SideStat icon={Archive} label="Clearance" value={data?.stock.clearance} title="Grade E" />
      </div>
    </Card>
  );
}

function SideStat({
  icon: Icon,
  label,
  value,
  title,
}: {
  icon: typeof Warehouse;
  label: string;
  value: number | undefined;
  title: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-glass-soft px-3 py-2.5" title={title}>
      <p className="flex items-center gap-1 text-[11px] text-fg-subtle">
        <Icon aria-hidden="true" className="size-3 shrink-0" />
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1 text-base font-semibold tabular-nums text-fg">{value ?? "—"}</p>
    </div>
  );
}

function Kpi({
  icon: Icon,
  tone,
  label,
  value,
  now,
  before,
  compared,
  footnote,
}: {
  icon: typeof Warehouse;
  tone: string;
  label: string;
  value: string | null;
  now: number | undefined;
  before: number | undefined;
  compared: string;
  footnote?: string;
}) {
  return (
    <Card className="flex min-w-0 flex-col p-3.5 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[13px] font-medium text-fg-muted">{label}</p>
        <span className={cn("hidden size-8 shrink-0 items-center justify-center rounded-xl min-[400px]:flex", tone)}>
          <Icon aria-hidden="true" className="size-4" />
        </span>
      </div>
      {value === null ? (
        <div className="mt-3 h-8 w-20 animate-pulse rounded-lg bg-glass-soft" />
      ) : (
        <p className="mt-2 truncate text-[22px] leading-tight font-semibold tracking-tight tabular-nums text-fg sm:mt-3 sm:text-3xl">
          {value}
        </p>
      )}
      <div className="mt-auto pt-2">
        <Delta now={now} before={before} compared={compared} />
        {footnote && <p className="mt-1 truncate text-[11px] text-fg-subtle">{footnote}</p>}
      </div>
    </Card>
  );
}

// "↗ 12% vs yesterday". Calm colours: a change isn't automatically good or bad.
function Delta({ now, before, compared }: { now: number | undefined; before: number | undefined; compared: string }) {
  if (now === undefined || before === undefined) return <p className="h-5 text-[11px]">&nbsp;</p>;
  const diff = now - before;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  const text = before === 0 ? (now === 0 ? "Same" : "New") : `${Math.abs(Math.round((diff / before) * 100))}%`;
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-[11px]">
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums",
          diff > 0 ? "bg-success-soft text-success" : diff < 0 ? "bg-warn-soft text-warn" : "bg-glass-soft text-fg-muted"
        )}
      >
        <Icon aria-hidden="true" className="size-3" />
        {text}
      </span>
      <span className="truncate text-fg-subtle">{compared}</span>
    </p>
  );
}

function SeriesToggle({
  label,
  total,
  color,
  on,
  onToggle,
}: {
  label: string;
  total: number | undefined;
  color: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        "flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium ring-1 ring-inset outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60",
        on ? "bg-glass-soft text-fg ring-line" : "text-fg-subtle ring-line-soft"
      )}
    >
      <span aria-hidden="true" className={cn("size-2.5 rounded-full", on ? color : "bg-fg-subtle/30")} />
      <span className={cn(!on && "line-through")}>{label}</span>
      <span className="tabular-nums text-fg-muted">{total ?? "—"}</span>
    </button>
  );
}

const TOP_ROWS = 5;

function Leaderboard({
  title,
  subtitle,
  empty,
  fill,
  rows,
}: {
  title: string;
  subtitle: string;
  empty: string;
  fill: string;
  rows: { id: string; name: string; count: number; detail: string }[] | undefined;
}) {
  const [showAll, setShowAll] = useState(false);
  const total = rows?.reduce((sum, r) => sum + r.count, 0) ?? 0;
  const max = rows?.[0]?.count ?? 0;
  const visible = rows ? (showAll ? rows : rows.slice(0, TOP_ROWS)) : [];

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        <p className="text-xs text-fg-subtle">{subtitle}</p>
      </div>

      {!rows ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="size-9 animate-pulse rounded-full bg-glass-soft" />
              <div className="h-9 flex-1 animate-pulse rounded-xl bg-glass-soft" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl bg-glass-soft px-4 py-8 text-center text-sm text-fg-muted">{empty}</p>
      ) : (
        <>
          <ol className="space-y-4">
            {visible.map((r, i) => (
              <li key={r.id} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-glass-hover text-xs font-semibold text-fg-muted"
                >
                  {initials(r.name)}
                  {i < 3 && (
                    <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-background text-[9px] font-bold text-fg-muted ring-1 ring-line">
                      {i + 1}
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium text-fg">{r.name}</span>
                    <span className="shrink-0 text-sm tabular-nums">
                      <span className="font-semibold text-fg">{r.count}</span>
                      <span className="ml-1.5 text-xs text-fg-subtle">{total ? Math.round((r.count / total) * 100) : 0}%</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-glass-soft">
                    <div
                      className={cn("h-full rounded-full transition-[width] duration-500", fill)}
                      style={{ width: `${max ? (r.count / max) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="mt-1 truncate text-[11px] text-fg-subtle">{r.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          {rows.length > TOP_ROWS && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-4 w-full rounded-xl py-2 text-xs font-medium text-fg-muted outline-none transition-colors hover:bg-glass-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              {showAll ? "Show top 5" : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
