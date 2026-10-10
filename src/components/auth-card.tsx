"use client";

import { motion } from "motion/react";
import { Aperture } from "lucide-react";
import { Card } from "@/components/ui";

// Shared frosted panel for the signed-out screens (login, reset, set password).
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span
            className="flex size-12 items-center justify-center rounded-full shadow-xl shadow-accent-strong/40"
            style={{
              background: "radial-gradient(circle at 32% 28%, var(--accent-strong), var(--accent) 55%, #2d2a8f 100%)",
            }}
          >
            <Aperture aria-hidden="true" className="size-6 text-white" />
          </span>
          <p className="text-sm font-semibold tracking-wide text-fg-muted">Pixel Direct</p>
        </div>
        <Card className="p-6 sm:p-7">{children}</Card>
      </motion.div>
    </div>
  );
}
