"use client";

import { useEffect, useState } from "react";
import { Field, Select } from "@/components/ui";

// The Zebra GK420D takes direct-thermal stock in several widths/lengths —
// these are the common sizes people actually load into one. Persisted in
// localStorage since a tester prints many labels in a row and shouldn't have
// to re-pick the size every time.
const LABEL_SIZES = [
  { label: "2 × 1 in", widthIn: 2, heightIn: 1 },
  { label: "3 × 2 in", widthIn: 3, heightIn: 2 },
  { label: "4 × 2 in", widthIn: 4, heightIn: 2 },
  { label: "4 × 3 in", widthIn: 4, heightIn: 3 },
  { label: "4 × 6 in", widthIn: 4, heightIn: 6 },
];
const DEFAULT_SIZE_INDEX = 2; // "4 × 2 in" — a landscape size suits QR-left/text-right well
const STORAGE_KEY = "tester-label-size-index";

export function PrintableLabel({
  qrDataUrl,
  brandName,
  labelLine1,
  labelLine2,
  serialNumber,
}: {
  qrDataUrl: string;
  brandName: string;
  labelLine1: string;
  labelLine2: string;
  serialNumber: string;
}) {
  // Starts at the same default on server and client (avoids a hydration
  // mismatch), then corrects to the saved preference right after mount.
  const [sizeIndex, setSizeIndex] = useState(DEFAULT_SIZE_INDEX);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved !== null && LABEL_SIZES[Number(saved)]) setSizeIndex(Number(saved));
      } catch {
        // ignore — just keep the default
      }
    }, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  function handleSizeChange(index: number) {
    setSizeIndex(index);
    try {
      localStorage.setItem(STORAGE_KEY, String(index));
    } catch {
      // ignore — the selection just won't be remembered next time
    }
  }

  const size = LABEL_SIZES[sizeIndex];
  // The QR only needs to be big enough to scan reliably — sizing it to the
  // full label height (as before) left almost no width for the text on
  // landscape labels and cut off longer model names. Cap it well below the
  // label's own dimensions so the text column stays wide.
  const qrSizeIn = Math.max(0.5, Math.min(size.heightIn - 0.3, size.widthIn * 0.4));

  return (
    <div>
      <div className="mx-auto mb-4 max-w-[240px] print:hidden">
        <Field label="Label size loaded in the printer">
          <Select value={sizeIndex} onChange={(e) => handleSizeChange(Number(e.target.value))}>
            {LABEL_SIZES.map((s, i) => (
              <option key={s.label} value={i}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Label — QR on the left, details on the right. */}
      <div
        className="print-target mx-auto flex items-center gap-3 overflow-hidden rounded-lg border border-neutral-200 bg-white p-3 shadow-sm print:rounded-none print:border-none print:p-2 print:shadow-none"
        style={{ width: `${size.widthIn}in`, height: `${size.heightIn}in` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt=""
          className="shrink-0"
          style={{ height: `${qrSizeIn}in`, width: `${qrSizeIn}in` }}
        />
        <div className="min-w-0 flex-1 text-left">
          <p className="wrap-break-word text-[11px] font-semibold leading-tight">{brandName}</p>
          <p className="wrap-break-word text-[11px] font-semibold leading-tight">{labelLine1}</p>
          <p className="text-[11px] leading-tight">{labelLine2}</p>
          <p className="truncate text-[9px] leading-tight text-neutral-500">SN {serialNumber}</p>
        </div>
      </div>

      <style>{`
        @page { size: ${size.widthIn}in ${size.heightIn}in; margin: 0; }
        @media print {
          body { margin: 0; }
          /* However much stray height the rest of the page/layout carries
             (nav chrome, wrapper padding, future changes elsewhere), only
             the label itself is ever allowed to occupy the printed page —
             it's pinned to the page origin, independent of everything
             around it. This is what actually stops extra blank pages. */
          body * { visibility: hidden; }
          .print-target, .print-target * { visibility: visible; }
          .print-target {
            position: fixed;
            top: 0;
            left: 0;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}
