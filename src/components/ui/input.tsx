import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const fieldClasses =
  "min-h-11 w-full rounded-xl border border-line bg-field px-3.5 text-base text-fg backdrop-blur-md outline-none transition placeholder:text-fg-subtle hover:bg-field-hover focus:border-accent/70 focus:bg-field-focus focus:ring-4 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50";

// text-base (16px), not text-sm, is deliberate: iOS Safari zooms in on focus
// for any input under 16px, which is a real annoyance on a mobile-first form.
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldClasses, className)} {...props} />;
  }
);
