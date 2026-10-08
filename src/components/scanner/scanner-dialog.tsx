"use client";

import { forwardRef, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { Flashlight, FlashlightOff, X } from "lucide-react";
import { cn } from "@/lib/cn";

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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
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

// The live video with a framing guide. `frame` is the target area: a square for
// QR codes, a wide strip for a printed serial number / 1D barcode.
export const ScannerViewport = forwardRef<
  HTMLDivElement,
  {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    frame: "square" | "wide";
    status: "starting" | "ready" | "error";
    torch: { supported: boolean; on: boolean; toggle: () => void };
  }
>(function ScannerViewport({ videoRef, frame, status, torch }, frameRef) {
  return (
    <div className="relative min-h-0 flex-1 bg-black">
      <video ref={videoRef} className="absolute inset-0 size-full object-cover transform-none!" muted playsInline autoPlay />

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

      {torch.supported && (
        <button
          type="button"
          onClick={torch.toggle}
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
