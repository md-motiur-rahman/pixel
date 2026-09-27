import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// text-base (16px), not text-sm, is deliberate: iOS Safari zooms in on focus
// for any input under 16px, which is a real annoyance on a mobile-first form.
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3.5 text-base text-neutral-900 placeholder:text-neutral-400 outline-none transition-shadow focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-neutral-100 disabled:text-neutral-400",
          className
        )}
        {...props}
      />
    );
  }
);
