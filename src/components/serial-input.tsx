"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { ScanLine } from "lucide-react";
import { Input } from "@/components/ui";
import { SerialScannerDialog } from "@/components/serial-scanner-dialog";
import { cn } from "@/lib/cn";

// A text input for serial numbers with a scan button inside it. The button opens
// the camera (barcode or printed text). A USB/Bluetooth barcode scanner needs no
// button — it types into the focused field like a keyboard.
export const SerialInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
    value: string;
    onValueChange: (value: string) => void;
    /** Called after the camera reads a value (in addition to onValueChange) — e.g. to run a search straight away. */
    onScanned?: (value: string) => void;
  }
>(function SerialInput({ value, onValueChange, onScanned, className, disabled, ...props }, ref) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Input
        ref={ref}
        type="text"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        disabled={disabled}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn("pr-12", className)}
        {...props}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label="Scan serial number with camera"
        title="Scan with camera"
        className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-fg-muted transition-colors outline-none hover:bg-glass-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50"
      >
        <ScanLine aria-hidden="true" className="size-5" />
      </button>
      <SerialScannerDialog
        open={open}
        onOpenChange={setOpen}
        onResult={(scanned) => {
          onValueChange(scanned);
          setOpen(false);
          onScanned?.(scanned);
        }}
      />
    </div>
  );
});
