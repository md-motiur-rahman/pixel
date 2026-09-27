import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "destructive" | "ghost";
type Size = "default" | "sm";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700",
  secondary: "bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-50",
  destructive: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
  ghost: "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100",
};

const SIZE_CLASSES: Record<Size, string> = {
  default: "min-h-11 px-4 text-sm",
  sm: "min-h-9 px-3 text-sm",
};

export function Button({
  variant = "primary",
  size = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    />
  );
}
