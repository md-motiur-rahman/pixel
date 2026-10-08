import type { ButtonHTMLAttributes } from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-linear-to-b from-accent to-accent-strong text-white shadow-lg shadow-accent-strong/30 ring-1 ring-white/25 ring-inset hover:brightness-110",
        secondary: "glass text-fg hover:bg-glass-hover",
        destructive:
          "border border-danger-line bg-danger-soft text-danger backdrop-blur-md hover:bg-danger-soft hover:brightness-95 dark:hover:brightness-125",
        ghost: "text-fg-muted hover:bg-glass-hover hover:text-fg",
      },
      size: {
        default: "min-h-11 px-4 text-sm",
        sm: "min-h-9 px-3 text-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
);

export function Button({
  variant,
  size,
  className,
  asChild = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
