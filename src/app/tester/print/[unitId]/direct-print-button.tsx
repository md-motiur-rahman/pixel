"use client";

import { useState } from "react";
import { Button, Message } from "@/components/ui";

const QZ_PRINTER_KEY = "tester-qz-printer";

type Status = "idle" | "connecting" | "printing" | "done" | "error";

export function DirectPrintButton({
  unitId,
  brandName,
  labelLine1,
  labelLine2,
  serialNumber,
}: {
  unitId: string;
  brandName: string;
  labelLine1: string;
  labelLine2: string;
  serialNumber: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [printerChoices, setPrinterChoices] = useState<string[] | null>(null);
  const [lastPrinter, setLastPrinter] = useState<string | null>(null);

  async function runPrint(printerOverride?: string) {
    setStatus("connecting");
    setError(null);
    setPrinterChoices(null);

    try {
      const { connectQz, findPrinters, printZpl } = await import("@/lib/qz-print");
      const { buildLabelZpl } = await import("@/lib/zpl");

      await connectQz();

      let printerName = printerOverride ?? null;
      if (!printerName) {
        try {
          printerName = localStorage.getItem(QZ_PRINTER_KEY);
        } catch {
          // ignore — just won't have a remembered printer
        }
      }

      if (!printerName) {
        const found = await findPrinters();
        if (found.length === 0) {
          setStatus("error");
          setError("QZ Tray found no printers on this computer.");
          return;
        }
        const guess = found.find((p) => /zebra|gk420/i.test(p));
        if (found.length === 1) {
          printerName = found[0];
        } else if (guess) {
          printerName = guess;
        } else {
          setPrinterChoices(found);
          setStatus("idle");
          return;
        }
      }

      setStatus("printing");
      const zpl = buildLabelZpl({ unitId, brandName, labelLine1, labelLine2, serialNumber });
      await printZpl(printerName, zpl);

      try {
        localStorage.setItem(QZ_PRINTER_KEY, printerName);
      } catch {
        // ignore — the printer choice just won't be remembered next time
      }
      setLastPrinter(printerName);
      setStatus("done");
    } catch {
      setStatus("error");
      setError("Couldn't reach QZ Tray. Make sure it's installed and running on this computer.");
    }
  }

  return (
    <div className="print:hidden">
      <Button
        type="button"
        variant="secondary"
        onClick={() => void runPrint()}
        disabled={status === "connecting" || status === "printing"}
      >
        {status === "connecting" ? "Connecting…" : status === "printing" ? "Printing…" : "Print directly"}
      </Button>

      {printerChoices && (
        <div className="mt-2">
          <p className="text-sm text-neutral-500">Which printer?</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {printerChoices.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => void runPrint(p)}
                className="rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm hover:bg-neutral-50"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {status === "done" && (
        <Message variant="success" className="mt-2">
          Sent to {lastPrinter}.
        </Message>
      )}

      {status === "error" && error && (
        <Message variant="error" className="mt-2">
          {error}{" "}
          <a
            href="https://qz.io/download/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Get QZ Tray
          </a>
        </Message>
      )}
    </div>
  );
}
