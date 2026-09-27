import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3.5 text-base text-neutral-900 outline-none transition-shadow focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-neutral-100 disabled:text-neutral-400",
        className
      )}
      {...props}
    />
  );
}
