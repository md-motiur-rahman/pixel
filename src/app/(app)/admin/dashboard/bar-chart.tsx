"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export type ChartBucket = {
  /** Short axis label, e.g. "3 Oct" or "14:00". */
  label: string;
  /** Full name shown on hover, e.g. "Fri 3 Oct 2026". */
  title: string;
  /** One value per series. */
  values: number[];
};

export type ChartSeries = {
  name: string;
  /** Tailwind background class for the bars and the key. */
  color: string;
  hidden?: boolean;
};

// A round axis top (4, 5, 10, 20, 25, 50 …) at or above the largest value.
function niceMax(value: number) {
  if (value <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(value));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= value) return m * step;
  return 10 * step;
}

function formatTick(t: number) {
  if (t >= 1000) return `${Number((t / 1000).toFixed(1))}k`;
  return Number.isInteger(t) ? String(t) : t.toFixed(1);
}

// Grouped bars, one group per bucket. Plain HTML so it follows the theme and
// resizes with the page; hover (or tap) a group to see its numbers.
export function BarChart({ buckets, series }: { buckets: ChartBucket[]; series: ChartSeries[] }) {
  const [active, setActive] = useState<number | null>(null);
  const visible = series.map((s, i) => ({ ...s, i })).filter((s) => !s.hidden);
  const top = niceMax(Math.max(0, ...buckets.flatMap((b) => visible.map((s) => b.values[s.i]))));
  const ticks = [top, top / 2, 0];
  // Roughly 6 labels on a phone and 12 on a wide screen.
  const everyNarrow = Math.max(1, Math.ceil(buckets.length / 6));
  const everyWide = Math.max(1, Math.ceil(buckets.length / 12));
  const shown = active === null ? null : buckets[active];

  return (
    <div>
      {/* Readout for the bar under the finger / pointer */}
      <div className="mb-3 flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-glass-soft px-3 py-2 text-xs" aria-live="polite">
        {shown ? (
          <>
            <span className="font-medium text-fg">{shown.title}</span>
            {visible.map((s) => (
              <span key={s.name} className="flex items-center gap-1.5 text-fg-muted tabular-nums">
                <span aria-hidden="true" className={cn("size-2 rounded-full", s.color)} />
                {s.name} <span className="font-semibold text-fg">{shown.values[s.i]}</span>
              </span>
            ))}
          </>
        ) : (
          <span className="text-fg-subtle">Tap or hover a bar to see its numbers.</span>
        )}
      </div>

      <div className="flex gap-2">
        {/* Y axis */}
        <div className="flex h-44 w-7 shrink-0 flex-col justify-between text-right text-[10px] leading-none tabular-nums text-fg-subtle sm:h-60">
          {ticks.map((t, i) => (
            <span key={i} className={cn(i === 0 && "-translate-y-1/2", i === 2 && "translate-y-1/2")}>
              {formatTick(t)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-44 sm:h-60" onMouseLeave={() => setActive(null)}>
            {/* Grid lines */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col justify-between">
              {ticks.map((_, i) => (
                <div key={i} className={cn("border-t", i === ticks.length - 1 ? "border-line" : "border-dashed border-line-soft")} />
              ))}
            </div>

            <div
              role="img"
              aria-label={`Chart of ${visible.map((s) => s.name).join(" and ")} — ${buckets
                .map((b) => `${b.title}: ${visible.map((s) => `${s.name} ${b.values[s.i]}`).join(", ")}`)
                .join("; ")}`}
              className="absolute inset-0 flex items-end"
            >
              {buckets.map((b, i) => (
                <button
                  key={b.title}
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => setActive(active === i ? null : i)}
                  className={cn(
                    "flex h-full min-w-0 flex-1 basis-0 items-end justify-center gap-px rounded-md px-px outline-none transition-colors sm:gap-0.5 sm:px-1",
                    active === i ? "bg-glass-hover" : "hover:bg-glass-soft"
                  )}
                >
                  {visible.map((s) => {
                    const v = b.values[s.i];
                    return (
                      <span
                        key={s.name}
                        className={cn(
                          "w-full max-w-5 min-w-0 rounded-t-[3px] transition-[height,opacity] duration-300",
                          s.color,
                          active !== null && active !== i && "opacity-45"
                        )}
                        style={{ height: `${(v / top) * 100}%`, minHeight: v > 0 ? 3 : 0 }}
                      />
                    );
                  })}
                </button>
              ))}
            </div>
          </div>

          {/* X axis */}
          <div aria-hidden="true" className="mt-2 flex">
            {buckets.map((b, i) => (
              <span
                key={b.title}
                className={cn(
                  "flex min-w-0 flex-1 basis-0 justify-center overflow-visible text-[10px] whitespace-nowrap text-fg-subtle",
                  i % everyNarrow !== 0 && "max-sm:invisible",
                  i % everyWide !== 0 && "sm:invisible"
                )}
              >
                {b.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
