"use client";

import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui";

export function CameraScanButton({
  onScan,
  disabled,
}: {
  onScan: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    if (!open || !videoRef.current) return;

    // The decoder keeps firing until torn down, so one physical scan could be
    // handled twice (e.g. "Already scanned" right after a successful scan).
    let handled = false;
    const scanner: QrScanner = new QrScanner(
      videoRef.current,
      (result) => {
        if (handled) return;
        handled = true;
        scanner.stop();
        onScanRef.current(result.data);
        setOpen(false);
      },
      {
        preferredCamera: "environment",
        highlightScanRegion: true,
        highlightCodeOutline: true,
        returnDetailedScanResult: true,
      }
    );

    scanner.start().catch(() => {
      setError("Couldn't access the camera. Check camera permissions for this site and try again.");
    });

    return () => scanner.destroy();
  }, [open]);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <ScanLine aria-hidden="true" />
        Scan with camera
      </Button>

      {open && (
        <div className="dark fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80 p-4 backdrop-blur-xl">
          <div className="w-full max-w-sm glass overflow-hidden rounded-3xl p-2">
            <video ref={videoRef} className="aspect-square w-full rounded-2xl object-cover" muted playsInline />
          </div>
          {error ? (
            <p className="max-w-sm text-center text-sm text-danger">{error}</p>
          ) : (
            <p className="text-sm text-fg-muted">Point the camera at a camera&rsquo;s QR label.</p>
          )}
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      )}
    </>
  );
}
