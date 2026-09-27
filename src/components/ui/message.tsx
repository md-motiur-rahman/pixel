import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "error" | "success" | "info" | "warning";

const VARIANT_CLASSES: Record<Variant, string> = {
  error: "text-red-600",
  success: "text-green-700",
  info: "text-neutral-500",
  warning: "text-amber-700",
};

export function Message({
  variant = "info",
  className,
  children,
}: {
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return <p className={cn("text-sm", VARIANT_CLASSES[variant], className)}>{children}</p>;
}
