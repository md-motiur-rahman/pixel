"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useTrackControls } from "./use-track-controls";

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

type NativeDetector = { detect(source: HTMLCanvasElement): Promise<{ rawValue: string }[]> };
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
    // Only use it if it covers everything we need; otherwise fall back to ZXing.
    if (!wanted.every((f) => supported.includes(f))) return null;
    return new Ctor({ formats: wanted });
  } catch {
    return null;
  }
}

// The part of the camera frame that sits under `target` (the on-screen guide
// box), in the video's own pixel coordinates. Accounts for the video being
// object-cover and for any digital zoom (a CSS scale about the picture's centre).
function sourceRect(video: HTMLVideoElement, target: DOMRect | null, zoom: number, pad: number) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const box = (video.parentElement ?? video).getBoundingClientRect();
  const t = target ?? box;
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const left = cx + (t.left - cx) / zoom;
  const right = cx + (t.right - cx) / zoom;
  const top = cy + (t.top - cy) / zoom;
  const bottom = cy + (t.bottom - cy) / zoom;

  const scale = Math.max(box.width / vw, box.height / vh);
  const offX = (vw * scale - box.width) / 2;
  const offY = (vh * scale - box.height) / 2;

  let sx = (left - box.left + offX) / scale;
  let sy = (top - box.top + offY) / scale;
  let sw = (right - left) / scale;
  let sh = (bottom - top) / scale;

  sx -= sw * pad;
  sy -= sh * pad;
  sw *= 1 + 2 * pad;
  sh *= 1 + 2 * pad;

  sx = Math.max(0, sx);
  sy = Math.max(0, sy);
  sw = Math.min(vw - sx, sw);
  sh = Math.min(vh - sy, sh);
  return { sx, sy, sw, sh };
}

type ImageCaptureCtor = new (track: MediaStreamTrack) => { takePhoto(): Promise<Blob> };

/**
 * Opens the rear camera into `videoRef` and decodes barcodes from the framed
 * area (`regionRef`) — with the phone's built-in BarcodeDetector when there is
 * one (fast, reads small codes well), otherwise with ZXing (e.g. iPhone Safari).
 *
 * Decoding the framed crop at full camera resolution — rather than the whole
 * picture shrunk down — is what lets small codes and print read. Zoom, tap-to-
 * focus and the flashlight are in `controls`. `captureRegion` grabs a sharp
 * still of the framed area for reading printed text.
 *
 * `onDecode` gets every read; return `false` to ignore it and keep scanning,
 * anything else accepts it and stops (so one physical scan is handled once).
 */
export function useCameraScanner(
  videoRef: RefObject<HTMLVideoElement | null>,
  regionRef: RefObject<HTMLElement | null>,
  { formats, onDecode }: { formats: ScanFormat[]; onDecode: (text: string) => boolean | void }
) {
  const [state, setState] = useState<ScannerState>({ status: "starting" });
  const onDecodeRef = useRef(onDecode);
  const formatsRef = useRef(formats);
  const { controls, trackRef, digitalScaleRef } = useTrackControls(videoRef, state.status === "ready", {
    allowDigital: true,
  });

  useEffect(() => {
    onDecodeRef.current = onDecode;
  });

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let handled = false;
    // Copied here so the cleanup releases the same element this effect used.
    const videoEl = videoRef.current;

    // Started a tick later so a set-up/tear-down/set-up in quick succession
    // (React dev mode) never has two camera requests racing for the video.
    const startTimer = setTimeout(() => void start(), 0);

    async function start() {
      if (cancelled) return;
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setState({ status: "error", error: INSECURE_CAMERA_MESSAGE });
        return;
      }
      const video = videoRef.current;
      if (!video) return;

      try {
        const wanted = formatsRef.current;
        const native = await nativeDetectorFor(wanted);
        if (cancelled) return;

        // Always ask for full HD: small print and small codes need the pixels.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play().catch(() => {});

        // Decoder for the non-native path.
        let zx: {
          reader: import("@zxing/library").MultiFormatReader;
          lib: typeof import("@zxing/library");
        } | null = null;
        if (!native) {
          const lib = await import("@zxing/library");
          if (cancelled) return;
          const hints = new Map();
          hints.set(
            lib.DecodeHintType.POSSIBLE_FORMATS,
            wanted.map((f) => lib.BarcodeFormat[f])
          );
          hints.set(lib.DecodeHintType.TRY_HARDER, true);
          const reader = new lib.MultiFormatReader();
          reader.setHints(hints);
          zx = { reader, lib };
        }

        const canvas = document.createElement("canvas");
        // willReadFrequently: this canvas is read back every frame.
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        let attempt = 0;

        const tick = async () => {
          if (cancelled || handled) return;
          if (ctx && video.readyState >= 2 && video.videoWidth) {
            const { sx, sy, sw, sh } = sourceRect(
              video,
              regionRef.current?.getBoundingClientRect() ?? null,
              digitalScaleRef.current,
              0.08
            );
            if (sw > 8 && sh > 8) {
              // Cap the working size: big enough for small print, small enough to decode fast.
              const k = Math.min(1, 1600 / sw);
              canvas.width = Math.max(1, Math.round(sw * k));
              canvas.height = Math.max(1, Math.round(sh * k));
              ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

              let text: string | null = null;
              try {
                if (native) {
                  const codes = await native.detect(canvas);
                  text = codes[0]?.rawValue ?? null;
                } else if (zx) {
                  const { lib, reader } = zx;
                  const source = new lib.HTMLCanvasElementLuminanceSource(canvas);
                  // Alternate normal / inverted so light-on-dark labels read too.
                  const luminance = attempt++ % 2 === 0 ? source : source.invert();
                  text = reader.decodeWithState(new lib.BinaryBitmap(new lib.HybridBinarizer(luminance))).getText();
                }
              } catch {
                // Nothing readable in this frame — try the next one.
              }

              const trimmed = text?.trim();
              if (trimmed && onDecodeRef.current(trimmed) !== false) {
                handled = true;
                navigator.vibrate?.(60);
                return;
              }
            }
          }
          timer = setTimeout(tick, native ? 90 : 140);
        };

        setState({ status: "ready" });
        void tick();
      } catch (err) {
        if (!cancelled) setState({ status: "error", error: cameraErrorMessage(err) });
      }
    }

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      if (videoEl) videoEl.srcObject = null;
    };
  }, [videoRef, regionRef, digitalScaleRef]);

  // A sharp image of the framed area, for reading printed text. Prefers a
  // full-resolution still from the camera (it focuses first and uses the full
  // sensor) over a video frame, which is softer.
  const captureRegion = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const region = regionRef.current?.getBoundingClientRect() ?? null;
    const zoom = digitalScaleRef.current;
    const { sx, sy, sw, sh } = sourceRect(video, region, zoom, 0.04);

    let source: CanvasImageSource = video;
    let factor = 1;

    const ImageCapture = (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
    const track = trackRef.current;
    // A still only matches the on-screen picture when nothing is digitally zoomed
    // and its shape is the same as the preview's.
    if (ImageCapture && track && zoom === 1) {
      try {
        const bitmap = await createImageBitmap(await new ImageCapture(track).takePhoto());
        const sameShape = Math.abs(bitmap.width / bitmap.height - video.videoWidth / video.videoHeight) < 0.03;
        if (sameShape) {
          source = bitmap;
          factor = bitmap.width / video.videoWidth;
        }
      } catch {
        // No still available — use the video frame.
      }
    }

    const upscale = sw * factor < 1400 ? 1400 / (sw * factor) : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * factor * upscale);
    canvas.height = Math.round(sh * factor * upscale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Grayscale + extra contrast makes engraved/printed text far easier to read.
    ctx.filter = "grayscale(1) contrast(1.5)";
    ctx.drawImage(source, sx * factor, sy * factor, sw * factor, sh * factor, 0, 0, canvas.width, canvas.height);
    return canvas;
  }, [videoRef, regionRef, trackRef, digitalScaleRef]);

  return { state, controls, captureRegion };
}
