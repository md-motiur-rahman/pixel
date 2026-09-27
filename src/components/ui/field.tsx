import type { ReactNode } from "react";
import { Label } from "./label";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}
