import type { ButtonHTMLAttributes } from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-2xl font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Flat, pure accent fill — no gradient blend between two colours.
        // Depth comes from the shadow/ring, not from mixing hues.
        // border is in addition to the glossy inset ring, not instead of it.
        primary:
          "border border-line bg-accent text-white shadow-lg shadow-accent-strong/30 ring-1 ring-white/25 ring-inset hover:bg-accent-strong",
        // Same raised neumorphic surface as secondary — a destructive action
        // is distinguished only by red text, same as "Reset" in design.png,
        // not by a red fill. The light border is a ring, not an actual
        // border — .glass sets border:none, and a box-shadow ring can't
        // collide with that regardless of which rule Tailwind emits last.
        secondary: "glass text-fg ring-1 ring-line ring-inset hover:bg-glass-hover",
        destructive: "glass text-danger ring-1 ring-line ring-inset hover:bg-glass-hover",
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
