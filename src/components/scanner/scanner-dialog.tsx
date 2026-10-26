"use client";

import { forwardRef, useRef, type ReactNode, type RefObject } from "react";
import { Dialog } from "radix-ui";
import { Flashlight, FlashlightOff, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ScannerControls } from "./use-track-controls";

// Full-screen camera view on phones (a small preview is hard to aim with),
// a large centred panel on desktop. Always dark: it sits over a live camera feed.
export function ScannerDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className={cn(
            "dark fixed inset-0 z-50 flex flex-col overflow-hidden bg-black text-fg outline-none",
            "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[min(46rem,calc(100dvh-2rem))] sm:w-[min(34rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border sm:border-line",
            "data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95"
          )}
        >
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-linear-to-b from-black/70 to-transparent px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
            <Dialog.Title className="text-base font-semibold text-white drop-shadow">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close camera"
                className="glass flex size-10 items-center justify-center rounded-full text-white"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{description}</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function formatZoom(value: number) {
  return `${value.toFixed(1)}×`;
}

// The live video with a framing guide. `frame` is the target area: a square for
// QR codes, a wide strip for a printed serial number / 1D barcode.
// Pinch to zoom, tap to focus, plus a zoom slider (− / +) and flashlight.
export const ScannerViewport = forwardRef<
  HTMLDivElement,
  {
    videoRef: RefObject<HTMLVideoElement | null>;
    frame: "square" | "wide";
    status: "starting" | "ready" | "error";
    controls: ScannerControls;
  }
>(function ScannerViewport({ videoRef, frame, status, controls }, frameRef) {
  const { zoom, torch, refocus, videoStyle } = controls;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const tap = useRef<{ x: number; y: number; at: number } | null>(null);

  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const nudge = (direction: 1 | -1) => zoom.set(zoom.value + direction * Math.max(zoom.step, (zoom.max - zoom.min) / 12));

  return (
    <div
      className="relative min-h-0 flex-1 touch-none bg-black"
      onPointerDown={(e) => {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 1) tap.current = { x: e.clientX, y: e.clientY, at: Date.now() };
        else tap.current = null;
        if (pointers.current.size === 2 && zoom.supported) pinch.current = { distance: distance(), zoom: zoom.value };
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch.current && pointers.current.size === 2) {
          zoom.set(pinch.current.zoom * (distance() / pinch.current.distance));
        }
      }}
      onPointerUp={(e) => {
        const start = tap.current;
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) pinch.current = null;
        // A short, still touch = tap to focus.
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 10 && Date.now() - start.at < 350) refocus();
        tap.current = null;
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        pinch.current = null;
        tap.current = null;
      }}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 size-full origin-center object-cover transform-none!"
        style={videoStyle ? { ...videoStyle, transform: videoStyle.transform } : undefined}
        muted
        playsInline
        autoPlay
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          ref={frameRef}
          aria-hidden="true"
          className={cn(
            "relative rounded-3xl border-2 border-white/90 shadow-[0_0_0_9999px_rgb(0_0_0/0.45)]",
            frame === "square" ? "aspect-square w-[min(72vw,20rem)]" : "h-[min(22vw,7rem)] w-[min(88vw,28rem)]"
          )}
        >
          {status === "ready" && (
            <span className="absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 animate-pulse rounded-full bg-accent shadow-[0_0_12px_2px] shadow-accent/70" />
          )}
        </div>
      </div>

      {status === "starting" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Starting camera…</div>
      )}

      {status === "ready" && zoom.supported && (
        <div
          className="glass absolute bottom-4 left-4 z-10 flex items-center gap-1 rounded-full py-1 pr-3 pl-1 text-white"
          style={{ right: torch.supported ? "5rem" : "1rem" }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => nudge(-1)}
            className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15 active:scale-95"
          >
            <Minus aria-hidden="true" className="size-4" />
          </button>
          <input
            type="range"
            aria-label="Zoom"
            min={zoom.min}
            max={zoom.max}
            step={zoom.step}
            value={zoom.value}
            onChange={(e) => zoom.set(Number(e.target.value))}
            className="h-6 min-w-0 flex-1 accent-white"
          />
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => nudge(1)}
            className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15 active:scale-95"
          >
            <Plus aria-hidden="true" className="size-4" />
          </button>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums">{formatZoom(zoom.value)}</span>
        </div>
      )}

      {torch.supported && (
        <button
          type="button"
          onClick={torch.toggle}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          aria-pressed={torch.on}
          aria-label={torch.on ? "Turn flashlight off" : "Turn flashlight on"}
          className={cn(
            "absolute right-4 bottom-4 z-10 flex size-12 items-center justify-center rounded-full",
            torch.on ? "bg-white text-black" : "glass text-white"
          )}
        >
          {torch.on ? <FlashlightOff aria-hidden="true" className="size-5" /> : <Flashlight aria-hidden="true" className="size-5" />}
        </button>
      )}
    </div>
  );
});

export function ScannerFooter({ children }: { children: ReactNode }) {
  return (
    <div className="glass-strong z-10 max-h-[55%] shrink-0 space-y-3 overflow-y-auto rounded-none border-x-0 border-b-0 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-b-3xl">
      {children}
    </div>
  );
}
