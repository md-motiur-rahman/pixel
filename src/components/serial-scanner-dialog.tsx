"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, VisuallyHidden } from "radix-ui";
import { Check, RotateCcw, ScanText, X } from "lucide-react";
import { Button, Input, Message } from "@/components/ui";

// Serial numbers come in two shapes: a printed barcode, or just plain text on a
// sticker/engraving. One camera view handles both:
//   • barcodes (Code 128/39, EAN, DataMatrix, QR…) are decoded continuously and
//     accepted the moment they're read;
//   • for plain text, "Read text" captures the framed area and runs OCR, then
//     shows what it found so the person confirms or corrects it — OCR is
//     never trusted blindly, since O/0 and I/1 are easy to confuse.

const OCR_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-";

function extractCandidates(text: string): string[] {
  const found = new Map<string, number>();
  const add = (raw: string) => {
    const token = raw.replace(/^-+|-+$/g, "");
    if (token.length < 4 || token.length > 40) return;
    const hasDigit = /\d/.test(token);
    const hasLetter = /[A-Z]/.test(token);
    // Real serials are usually a mix of letters and digits; prefer those, then longer ones.
    const score = (hasDigit && hasLetter ? 100 : hasDigit ? 50 : 0) + token.length;
    found.set(token, Math.max(found.get(token) ?? 0, score));
  };
  for (const line of text.toUpperCase().split(/\r?\n/)) {
    // The whole line with spaces removed (a serial printed as "AB 123 456")…
    add(line.replace(/[^A-Z0-9-]/g, ""));
    // …and each space-separated piece on its own.
    for (const part of line.split(/\s+/)) add(part.replace(/[^A-Z0-9-]/g, ""));
  }
  return [...found.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([token]) => token);
}

type Review = { image: string; candidates: string[]; reading: boolean; error: string | null };

function ScannerBody({ onResult, onClose }: { onResult: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reviewActiveRef = useRef(false);
  // The decoder keeps firing until torn down — accept only the first barcode.
  const handledRef = useRef(false);
  const onResultRef = useRef(onResult);
  const workerRef = useRef<import("tesseract.js").Worker | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    onResultRef.current = onResult;
  });

  // Camera + continuous barcode decoding.
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | null = null;

    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (cancelled || !videoRef.current) return;

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.ITF,
          BarcodeFormat.CODABAR,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });

        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
          videoRef.current,
          (result) => {
            if (!result || reviewActiveRef.current || handledRef.current) return;
            const text = result.getText().trim();
            if (!text) return;
            handledRef.current = true;
            navigator.vibrate?.(60);
            onResultRef.current(text);
          }
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        stop = () => controls.stop();
        setReady(true);
      } catch {
        if (!cancelled) {
          setCameraError("Couldn't access the camera. Check camera permission for this site and try again.");
        }
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
      void workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  async function readText() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    // Crop to the on-screen guide box. The video is object-cover, so map the
    // box from screen coordinates back to the real frame.
    const rect = video.getBoundingClientRect();
    const scale = Math.max(rect.width / video.videoWidth, rect.height / video.videoHeight);
    const offX = (video.videoWidth * scale - rect.width) / 2;
    const offY = (video.videoHeight * scale - rect.height) / 2;
    const guideW = rect.width * 0.9;
    const guideH = rect.height * 0.3;
    const sx = (rect.width * 0.05 + offX) / scale;
    const sy = ((rect.height - guideH) / 2 + offY) / scale;
    const sw = guideW / scale;
    const sh = guideH / scale;

    const upscale = sw < 1400 ? 1400 / sw : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * upscale);
    canvas.height = Math.round(sh * upscale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Grayscale + extra contrast makes engraved/printed text far easier to read.
    ctx.filter = "grayscale(1) contrast(1.5)";
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    reviewActiveRef.current = true;
    setReview({ image: canvas.toDataURL("image/jpeg", 0.85), candidates: [], reading: true, error: null });
    setValue("");

    try {
      if (!workerRef.current) {
        const { createWorker, PSM } = await import("tesseract.js");
        const worker = await createWorker("eng");
        await worker.setParameters({
          tessedit_char_whitelist: OCR_WHITELIST,
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        });
        workerRef.current = worker;
      }
      const { data } = await workerRef.current.recognize(canvas);
      const candidates = extractCandidates(data.text);
      setValue(candidates[0] ?? "");
      setReview((r) => (r ? { ...r, candidates, reading: false } : r));
    } catch {
      setReview((r) =>
        r ? { ...r, reading: false, error: "Couldn't read the text (it needs an internet connection the first time). You can type it instead." } : r
      );
    }
  }

  function retake() {
    reviewActiveRef.current = false;
    setReview(null);
    setValue("");
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} className="size-full object-cover" muted playsInline />

        {/* Guide box = the area used for "Read text" */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[5%] top-[35%] h-[30%] rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]"
        />

        {!ready && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Starting camera…</div>
        )}
      </div>

      {cameraError && <Message variant="error">{cameraError}</Message>}

      {!review && (
        <>
          <p className="text-center text-sm text-fg-muted">
            Barcode? Hold it inside the box — it reads automatically.
            <br />
            Printed text only? Line it up in the box and tap Read text.
          </p>
          <div className="flex gap-2">
            <Button type="button" className="flex-1" onClick={() => void readText()} disabled={!ready}>
              <ScanText aria-hidden="true" />
              Read text
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      )}

      {review && (
        <div className="space-y-3 rounded-2xl border border-line-soft bg-glass-soft p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={review.image} alt="Captured area" className="max-h-24 w-full rounded-lg bg-black object-contain" />

          {review.reading ? (
            <p className="text-center text-sm text-fg-muted">Reading text…</p>
          ) : (
            <>
              {review.error ? (
                <Message variant="error">{review.error}</Message>
              ) : review.candidates.length === 0 ? (
                <Message variant="warning">No text found. Move closer, avoid glare and retake — or type it below.</Message>
              ) : (
                <div>
                  <p className="mb-1.5 text-xs text-fg-subtle">Tap the one that matches the sticker:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {review.candidates.map((candidate) => (
                      <button
                        key={candidate}
                        type="button"
                        onClick={() => setValue(candidate)}
                        className={
                          "rounded-full border px-3 py-1 font-mono text-sm transition-colors " +
                          (value === candidate
                            ? "border-accent/50 bg-accent/20 text-fg"
                            : "border-line bg-glass-soft text-fg-muted hover:text-fg")
                        }
                      >
                        {candidate}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="serial-scan-value" className="mb-1.5 block text-sm font-medium text-fg-muted">
                  Serial number — check it against the camera
                </label>
                <Input
                  id="serial-scan-value"
                  type="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  value={value}
                  onChange={(e) => setValue(e.target.value.toUpperCase())}
                  className="font-mono tracking-wide"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  className="flex-1"
                  disabled={!value.trim()}
                  onClick={() => onResult(value.trim())}
                >
                  <Check aria-hidden="true" />
                  Use this serial
                </Button>
                <Button type="button" variant="secondary" onClick={retake}>
                  <RotateCcw aria-hidden="true" />
                  Retake
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SerialScannerDialog({
  open,
  onOpenChange,
  onResult,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResult: (value: string) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className="dark glass-strong fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl p-4 outline-none"
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold text-fg">Scan serial number</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close scanner"
                className="flex size-8 items-center justify-center rounded-lg text-fg-subtle hover:bg-glass-hover hover:text-fg"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </Dialog.Close>
          </div>
          <VisuallyHidden.Root>
            <Dialog.Description>Point the camera at a barcode, or capture the printed serial number.</Dialog.Description>
          </VisuallyHidden.Root>
          <ScannerBody onResult={onResult} onClose={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
