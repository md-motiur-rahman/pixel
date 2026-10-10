import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium capitalize",
  {
    variants: {
      tone: {
        success: "border-success-line bg-success-soft text-success",
        warning: "border-warn-line bg-warn-soft text-warn",
        neutral: "border-line bg-glass-soft text-fg-muted",
        danger: "border-danger-line bg-danger-soft text-danger",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export function Badge({
  tone,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
