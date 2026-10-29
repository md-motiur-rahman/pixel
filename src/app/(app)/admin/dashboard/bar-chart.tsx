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

// A round axis top (1, 2, 5, 10, 20, 50 …) at or above the largest value.
function niceMax(value: number) {
  if (value <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(value));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= value) return m * step;
  return 10 * step;
}

// Grouped bars, one group per bucket. Plain HTML so it follows the theme and
// resizes with the page; hover (or tap) a group to see its numbers.
export function BarChart({
  buckets,
  series,
  colors,
}: {
  buckets: ChartBucket[];
  series: string[];
  /** Tailwind background class per series. */
  colors: string[];
}) {
  const [active, setActive] = useState<number | null>(null);
  const top = niceMax(Math.max(0, ...buckets.flatMap((b) => b.values)));
  const ticks = [top, (top * 3) / 4, top / 2, top / 4, 0];
  // Leave roughly 8 labels on a phone and 14 on a wide screen.
  const everyNarrow = Math.max(1, Math.ceil(buckets.length / 8));
  const everyWide = Math.max(1, Math.ceil(buckets.length / 14));
  const shown = active === null ? null : buckets[active];

  return (
    <div>
      <div className="mb-2 h-5 text-xs text-fg-muted" aria-live="polite">
        {shown ? (
          <>
            <span className="font-medium text-fg">{shown.title}</span>
            {series.map((name, i) => (
              <span key={name} className="ml-3 tabular-nums">
                {name} <span className="font-semibold text-fg">{shown.values[i]}</span>
              </span>
            ))}
          </>
        ) : (
          "Hover or tap a bar to see its numbers."
        )}
      </div>

      <div className="flex gap-2">
        {/* Y axis */}
        <div className="flex h-48 flex-col justify-between text-right text-[10px] leading-none tabular-nums text-fg-subtle sm:h-56">
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-48 sm:h-56" onMouseLeave={() => setActive(null)}>
            {/* Grid lines */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col justify-between">
              {ticks.map((t) => (
                <div key={t} className="border-t border-line-soft" />
              ))}
            </div>

            <div
              role="img"
              aria-label={`Chart of ${series.join(" and ")} — ${buckets
                .map((b) => `${b.title}: ${b.values.map((v, i) => `${series[i]} ${v}`).join(", ")}`)
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
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  className={cn(
                    "flex h-full min-w-0 flex-1 items-end justify-center gap-px rounded-md px-[12%] outline-none",
                    active === i && "bg-glass-hover"
                  )}
                >
                  {b.values.map((v, s) => (
                    <span
                      key={s}
                      className={cn("w-full max-w-4 rounded-t-sm transition-[height]", colors[s], v === 0 && "opacity-0")}
                      style={{ height: `${(v / top) * 100}%`, minHeight: v > 0 ? 2 : 0 }}
                    />
                  ))}
                </button>
              ))}
            </div>
          </div>

          {/* X axis */}
          <div aria-hidden="true" className="mt-1.5 flex">
            {buckets.map((b, i) => (
              <span
                key={b.title}
                className={cn(
                  "min-w-0 flex-1 overflow-visible text-center text-[10px] whitespace-nowrap text-fg-subtle",
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
