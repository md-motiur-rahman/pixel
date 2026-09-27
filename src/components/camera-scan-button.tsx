"use client";

import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { Button } from "@/components/ui";

export function CameraScanButton({ onScan }: { onScan: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    if (!open || !videoRef.current) return;

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
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
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M2 4a2 2 0 012-2h1a1 1 0 010 2H4v1a1 1 0 01-2 0V4zM14 2a1 1 0 100 2h1v1a1 1 0 102 0V4a2 2 0 00-2-2h-1zM2 15a2 2 0 002 2h1a1 1 0 100-2H4v-1a1 1 0 10-2 0v1zM16 14a1 1 0 011 1v1a2 2 0 01-2 2h-1a1 1 0 110-2h1v-1a1 1 0 011-1zM7 6a1 1 0 00-1 1v6a1 1 0 001 1h6a1 1 0 001-1V7a1 1 0 00-1-1H7z" />
        </svg>
        Scan with camera
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/95 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
          </div>
          {error ? (
            <p className="max-w-sm text-center text-sm text-red-300">{error}</p>
          ) : (
            <p className="text-sm text-neutral-300">Point the camera at a camera&rsquo;s QR label.</p>
          )}
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      )}
    </>
  );
}
