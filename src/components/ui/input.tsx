import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// well: the same pressed-in groove as any other recessed neumorphic
// surface — no border, the inset shadow alone reads as "a slot you type
// into".
export const fieldClasses =
  "well min-h-11 w-full rounded-xl bg-field px-3.5 text-base text-fg outline-none transition placeholder:text-fg-subtle hover:bg-field-hover focus:bg-field-focus focus:ring-4 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-50";

// text-base (16px), not text-sm, is deliberate: iOS Safari zooms in on focus
// for any input under 16px, which is a real annoyance on a mobile-first form.
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldClasses, className)} {...props} />;
  }
);
