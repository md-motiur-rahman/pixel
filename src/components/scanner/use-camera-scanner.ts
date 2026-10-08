"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export type ScanFormat =
  | "QR_CODE"
  | "DATA_MATRIX"
  | "CODE_128"
  | "CODE_39"
  | "CODE_93"
  | "EAN_13"
  | "EAN_8"
  | "UPC_A"
  | "ITF"
  | "CODABAR";

type ScannerState = { status: "starting" | "ready" } | { status: "error"; error: string };

export const INSECURE_CAMERA_MESSAGE =
  "The camera only works over a secure connection. Open the app from its https:// address — not an http:// or IP address.";

// Phones only expose the camera on secure (https) pages, and each failure has a
// different fix — say which one it is instead of a generic "couldn't access".
export function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  const text = typeof err === "string" ? err : err instanceof Error ? err.message : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera permission is blocked. Allow camera access for this site in your browser settings, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError" || /not found/i.test(text)) {
    return "No camera was found on this device.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The camera is being used by another app. Close that app and try again.";
  }
  return "Couldn't start the camera. Close other apps using it, reload the page and try again.";
}

// Names used by the browser's built-in BarcodeDetector (Android Chrome etc.).
const NATIVE_FORMAT: Record<ScanFormat, string> = {
  QR_CODE: "qr_code",
  DATA_MATRIX: "data_matrix",
  CODE_128: "code_128",
  CODE_39: "code_39",
  CODE_93: "code_93",
  EAN_13: "ean_13",
  EAN_8: "ean_8",
  UPC_A: "upc_a",
  ITF: "itf",
  CODABAR: "codabar",
};

type NativeDetector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type NativeDetectorCtor = {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
};

async function nativeDetectorFor(formats: ScanFormat[]): Promise<NativeDetector | null> {
  const Ctor = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const supported = await Ctor.getSupportedFormats();
    const wanted = formats.map((f) => NATIVE_FORMAT[f]);
    // Only use it if it covers everything we need; otherwise fall back.
    if (!wanted.every((f) => supported.includes(f))) return null;
    return new Ctor({ formats: wanted });
  } catch {
    return null;
  }
}

/**
 * Opens the rear camera into `videoRef` and decodes barcodes continuously —
 * with the phone's built-in BarcodeDetector when it has one (fast, reads small
 * codes well), otherwise with ZXing (e.g. iPhone Safari).
 * `onDecode` gets every read; return `false` to ignore it and keep scanning,
 * anything else accepts it and stops (so one physical scan is handled once).
 */
export function useCameraScanner(
  videoRef: RefObject<HTMLVideoElement | null>,
  {
    formats,
    onDecode,
    highResolution = false,
  }: { formats: ScanFormat[]; onDecode: (text: string) => boolean | void; highResolution?: boolean }
) {
  const [state, setState] = useState<ScannerState>({ status: "starting" });
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const onDecodeRef = useRef(onDecode);
  const optionsRef = useRef({ formats, highResolution });
  const switchTorchRef = useRef<((on: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    onDecodeRef.current = onDecode;
  });

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | null = null;
    let handled = false;

    // Returns true when the read was accepted (scanning should stop).
    const accept = (raw: string) => {
      const text = raw.trim();
      if (!text || handled) return false;
      if (onDecodeRef.current(text) === false) return false;
      handled = true;
      navigator.vibrate?.(60);
      return true;
    };

    // Started a tick later so a set-up/tear-down/set-up in quick succession
    // (React dev mode) never has two camera requests racing for the video.
    const startTimer = setTimeout(() => void start(), 0);

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setState({ status: "error", error: INSECURE_CAMERA_MESSAGE });
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      const { formats: wanted, highResolution: hiRes } = optionsRef.current;

      try {
        const native = await nativeDetectorFor(wanted);
        if (cancelled) return;

        if (native) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: hiRes ? 1920 : 1280 },
              height: { ideal: hiRes ? 1080 : 720 },
            },
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          video.srcObject = stream;
          await video.play().catch(() => {});

          let running = true;
          let timer: ReturnType<typeof setTimeout> | undefined;
          const tick = async () => {
            if (!running) return;
            if (video.readyState >= 2) {
              try {
                const codes = await native.detect(video);
                for (const code of codes) {
                  if (accept(code.rawValue)) {
                    running = false;
                    break;
                  }
                }
              } catch {
                // a dropped frame — try the next one
              }
            }
            if (running) timer = setTimeout(tick, 100);
          };
          void tick();

          const track = stream.getVideoTracks()[0];
          const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
          if (caps?.torch) {
            switchTorchRef.current = (on) =>
              track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
            setTorchSupported(true);
          }
          stop = () => {
            running = false;
            clearTimeout(timer);
            stream.getTracks().forEach((t) => t.stop());
            video.srcObject = null;
          };
          setState({ status: "ready" });
          return;
        }

        // Fallback: ZXing in JS. Kept at 720p — decoding every frame in JS at
        // 1080p is too slow on a phone to scan reliably.
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (cancelled) return;

        const hints = new Map();
        hints.set(
          DecodeHintType.POSSIBLE_FORMATS,
          wanted.map((f) => BarcodeFormat[f])
        );
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });

        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          },
          video,
          (result) => {
            if (result && accept(result.getText())) controls.stop();
          }
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        stop = () => controls.stop();
        if (controls.switchTorch) {
          switchTorchRef.current = controls.switchTorch;
          setTorchSupported(true);
        }
        setState({ status: "ready" });
      } catch (err) {
        if (!cancelled) setState({ status: "error", error: cameraErrorMessage(err) });
      }
    }

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      stop?.();
      switchTorchRef.current = null;
    };
  }, [videoRef]);

  async function toggleTorch() {
    const next = !torchOn;
    try {
      await switchTorchRef.current?.(next);
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }

  return { state, torch: { supported: torchSupported, on: torchOn, toggle: toggleTorch } };
}
