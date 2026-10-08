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
  // Only offer the QZ Tray download link when QZ Tray itself is the problem.
  const [showQzLink, setShowQzLink] = useState(false);

  async function runPrint(printerOverride?: string) {
    setStatus("connecting");
    setError(null);
    setPrinterChoices(null);

    let qz: typeof import("@/lib/qz-print");
    let buildLabelZpl: typeof import("@/lib/zpl").buildLabelZpl;
    try {
      qz = await import("@/lib/qz-print");
      ({ buildLabelZpl } = await import("@/lib/zpl"));
      await qz.connectQz();
    } catch {
      setStatus("error");
      setError("Couldn't reach QZ Tray. Make sure it's installed and running on this computer.");
      setShowQzLink(true);
      return;
    }

    let printerName = printerOverride ?? null;
    let remembered = false;
    if (!printerName) {
      try {
        printerName = localStorage.getItem(QZ_PRINTER_KEY);
        remembered = printerName !== null;
      } catch {
        // ignore — just won't have a remembered printer
      }
    }

    if (!printerName) {
      let found: string[];
      try {
        found = await qz.findPrinters();
      } catch {
        setStatus("error");
        setError("QZ Tray is running but couldn't list this computer's printers.");
        setShowQzLink(false);
        return;
      }
      if (found.length === 0) {
        setStatus("error");
        setError("QZ Tray found no printers on this computer. Check the Zebra is connected and switched on.");
        setShowQzLink(false);
        return;
      }
      const guess = found.find((name) => /zebra|gk420/i.test(name));
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
    try {
      const zpl = buildLabelZpl({ unitId, brandName, labelLine1, labelLine2, serialNumber });
      await qz.printZpl(printerName, zpl);
    } catch {
      if (remembered) {
        // The saved printer may have been renamed or removed — forget it so the
        // next attempt looks the printers up again instead of failing forever.
        try {
          localStorage.removeItem(QZ_PRINTER_KEY);
        } catch {
          // ignore
        }
      }
      setStatus("error");
      setError(
        remembered
          ? `Couldn't print to "${printerName}" — it may be offline or renamed. Try again to choose a printer.`
          : `Couldn't print to "${printerName}". Check it's switched on, has labels loaded, and isn't showing an error.`
      );
      setShowQzLink(false);
      return;
    }

    try {
      localStorage.setItem(QZ_PRINTER_KEY, printerName);
    } catch {
      // ignore — the printer choice just won't be remembered next time
    }
    setLastPrinter(printerName);
    setStatus("done");
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
          <p className="text-sm text-fg-muted">Which printer?</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {printerChoices.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => void runPrint(p)}
                className="rounded-md border border-line px-2.5 py-1.5 text-sm hover:bg-glass-hover"
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
          {error}
          {showQzLink && (
            <>
              {" "}
              <a href="https://qz.io/download/" target="_blank" rel="noreferrer" className="underline">
                Get QZ Tray
              </a>
            </>
          )}
        </Message>
      )}
    </div>
  );
}
