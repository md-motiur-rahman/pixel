"use client";

// Fixed to the pharmacy label stock actually loaded in the Zebra GK420D —
// printing at any other size split a single label's content across two
// physical stickers. Don't reintroduce a size picker without confirming the
// stock in use.
const WIDTH_IN = 2;
const HEIGHT_IN = 1;
const QR_SIZE_IN = 0.7;

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
  return (
    <div>
      {/* Label — QR on the left, details on the right. */}
      <div
        className="print-target mx-auto flex items-center gap-2 overflow-hidden rounded-lg border border-neutral-200 bg-white p-2 shadow-sm print:rounded-none print:border-none print:p-1 print:shadow-none"
        style={{ width: `${WIDTH_IN}in`, height: `${HEIGHT_IN}in` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt=""
          className="shrink-0"
          style={{ height: `${QR_SIZE_IN}in`, width: `${QR_SIZE_IN}in` }}
        />
        <div className="min-w-0 flex-1 text-left">
          <p className="wrap-break-word text-[9px] font-semibold leading-tight">{brandName}</p>
          <p className="wrap-break-word text-[9px] font-semibold leading-tight">{labelLine1}</p>
          <p className="text-[9px] leading-tight">{labelLine2}</p>
          <p className="truncate text-[8px] leading-tight text-neutral-500">SN {serialNumber}</p>
        </div>
      </div>

      <style>{`
        @page { size: ${WIDTH_IN}in ${HEIGHT_IN}in; margin: 0; }
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
