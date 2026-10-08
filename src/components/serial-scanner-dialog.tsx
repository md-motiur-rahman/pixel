"use client";

import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw, ScanText } from "lucide-react";
import { Button, Input, Message } from "@/components/ui";
import { ScannerDialog, ScannerFooter, ScannerViewport } from "@/components/scanner/scanner-dialog";
import { useCameraScanner } from "@/components/scanner/use-camera-scanner";

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

function SerialScannerBody({ onResult, onClose }: { onResult: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const reviewActiveRef = useRef(false);
  const workerRef = useRef<import("tesseract.js").Worker | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [value, setValue] = useState("");

  const { state, torch } = useCameraScanner(videoRef, {
    formats: ["CODE_128", "CODE_39", "CODE_93", "EAN_13", "EAN_8", "UPC_A", "ITF", "CODABAR", "DATA_MATRIX", "QR_CODE"],
    highResolution: true,
    onDecode: (text) => {
      // While someone is reviewing an OCR reading, ignore barcodes in view.
      if (reviewActiveRef.current) return false;
      onResult(text);
    },
  });

  useEffect(() => {
    return () => {
      void workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  async function readText() {
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame || !video.videoWidth) return;

    // Crop to the on-screen guide box. The video is object-cover, so map the
    // box from screen coordinates back to the real frame.
    const vr = video.getBoundingClientRect();
    const fr = frame.getBoundingClientRect();
    const scale = Math.max(vr.width / video.videoWidth, vr.height / video.videoHeight);
    const offX = (video.videoWidth * scale - vr.width) / 2;
    const offY = (video.videoHeight * scale - vr.height) / 2;
    const sx = Math.max(0, (fr.left - vr.left + offX) / scale);
    const sy = Math.max(0, (fr.top - vr.top + offY) / scale);
    const sw = Math.min(video.videoWidth - sx, fr.width / scale);
    const sh = Math.min(video.videoHeight - sy, fr.height / scale);

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
        r
          ? {
              ...r,
              reading: false,
              error: "Couldn't read the text (it needs an internet connection the first time). You can type it instead.",
            }
          : r
      );
    }
  }

  function retake() {
    reviewActiveRef.current = false;
    setReview(null);
    setValue("");
  }

  return (
    <>
      <ScannerViewport ref={frameRef} videoRef={videoRef} frame="wide" status={state.status} torch={torch} />

      <ScannerFooter>
        {state.status === "error" && <Message variant="error">{state.error}</Message>}

        {!review && (
          <>
            {state.status !== "error" && (
              <p className="text-center text-sm text-fg-muted">
                Barcode? Hold it inside the box — it reads automatically.
                <br />
                Printed text only? Line it up in the box and tap Read text.
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" className="flex-1" onClick={() => void readText()} disabled={state.status !== "ready"}>
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
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={review.image} alt="Captured area" className="max-h-20 w-full rounded-lg bg-black object-contain" />

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
                  <Button type="button" className="flex-1" disabled={!value.trim()} onClick={() => onResult(value.trim())}>
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
      </ScannerFooter>
    </>
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
    <ScannerDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Scan serial number"
      description="Point the camera at a barcode, or capture the printed serial number."
    >
      <SerialScannerBody onResult={onResult} onClose={() => onOpenChange(false)} />
    </ScannerDialog>
  );
}
