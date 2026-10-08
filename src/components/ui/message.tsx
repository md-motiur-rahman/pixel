import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const messageVariants = cva("flex items-start gap-2 text-sm", {
  variants: {
    variant: {
      error: "text-danger",
      success: "text-success",
      info: "text-fg-muted",
      warning: "text-warn",
    },
  },
  defaultVariants: { variant: "info" },
});

const ICONS: Record<NonNullable<VariantProps<typeof messageVariants>["variant"]>, LucideIcon> = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
};

export function Message({
  variant = "info",
  className,
  children,
}: VariantProps<typeof messageVariants> & {
  className?: string;
  children: ReactNode;
}) {
  const Icon = ICONS[variant ?? "info"];
  return (
    <p className={cn(messageVariants({ variant }), className)} role={variant === "error" ? "alert" : undefined}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
