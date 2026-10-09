"use client";

import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { ScanLine } from "lucide-react";
import { Button, Message } from "@/components/ui";
import { ScannerDialog, ScannerFooter, ScannerViewport } from "@/components/scanner/scanner-dialog";
import { cameraErrorMessage, INSECURE_CAMERA_MESSAGE } from "@/components/scanner/use-camera-scanner";
import { useTrackControls } from "@/components/scanner/use-track-controls";

// QR labels are scanned with qr-scanner — it uses the phone's built-in barcode
// detector where available (fast, good with small labels) and its own worker
// otherwise. This is the engine that's proven on the warehouse phones.
function QrScannerBody({ onScan, onClose }: { onScan: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const [status, setStatus] = useState<"starting" | "ready" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const { controls } = useTrackControls(videoRef, status === "ready", { allowDigital: false });

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let scanner: QrScanner | null = null;
    // The decoder keeps firing until torn down, so one physical scan could be
    // handled twice (e.g. "Already scanned" right after a successful scan).
    let handled = false;

    // Started a tick later, not straight away: when an effect is set up, torn
    // down and set up again in quick succession (React does this in dev), a
    // scanner that started immediately would still be waiting on the camera
    // after its teardown — and then clear the live scanner's video stream.
    const startTimer = setTimeout(() => void start(video), 0);

    async function start(target: HTMLVideoElement) {
      if (cancelled) return;
      const instance: QrScanner = new QrScanner(
        target,
        (result: QrScanner.ScanResult) => {
          if (handled) return;
          handled = true;
          instance.stop();
          navigator.vibrate?.(60);
          onScanRef.current(result.data);
          onCloseRef.current();
        },
        { preferredCamera: "environment", returnDetailedScanResult: true }
      );
      scanner = instance;
      scannerRef.current = instance;

      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setError(INSECURE_CAMERA_MESSAGE);
        return;
      }
      try {
        await instance.start();
        if (cancelled) return;
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(cameraErrorMessage(err));
      }
    }

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      scanner?.destroy();
      scannerRef.current = null;
    };
  }, []);

  return (
    <>
      <ScannerViewport videoRef={videoRef} frame="square" status={status} controls={controls} />
      <ScannerFooter>
        {status === "error" && error ? (
          <Message variant="error">{error}</Message>
        ) : (
          <p className="text-center text-sm text-fg-muted">
            Hold the camera&rsquo;s QR label inside the square — it scans automatically.
          </p>
        )}
        <Button type="button" variant="secondary" className="w-full" onClick={onClose}>
          Cancel
        </Button>
      </ScannerFooter>
    </>
  );
}

export function CameraScanButton({
  onScan,
  disabled,
}: {
  onScan: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>
        <ScanLine aria-hidden="true" />
        Scan with camera
      </Button>

      <ScannerDialog
        open={open}
        onOpenChange={setOpen}
        title="Scan QR label"
        description="Point the camera at a camera's QR label."
      >
        <QrScannerBody onScan={onScan} onClose={() => setOpen(false)} />
      </ScannerDialog>
    </>
  );
}
