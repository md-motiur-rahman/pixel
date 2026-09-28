"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { Label } from "./label";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const generatedId = useId();

  let control = children;
  let controlId = generatedId;

  if (isValidElement(children)) {
    const existingId = (children.props as { id?: string }).id;
    controlId = existingId ?? generatedId;
    control = cloneElement(children as ReactElement<{ id?: string }>, { id: controlId });
  }

  return (
    <div>
      <Label htmlFor={controlId}>{label}</Label>
      {control}
      {hint && <p className="mt-1.5 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}
