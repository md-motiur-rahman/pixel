import { findColor } from "@/lib/colors";
import { cn } from "@/lib/cn";

// A colour name as a coloured pill. Unknown (older, free-typed) colours get a
// neutral pill so nothing is ever hidden.
export function ColorPill({ color, className }: { color: string; className?: string }) {
  const preset = findColor(color);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        !preset && "border border-line bg-glass-soft text-fg-muted",
        className
      )}
      style={
        preset
          ? {
              backgroundColor: preset.bg,
              color: preset.fg,
              boxShadow: preset.outline ? "inset 0 0 0 1px rgb(0 0 0 / 0.18)" : undefined,
            }
          : undefined
      }
    >
      {preset?.name ?? color}
    </span>
  );
}
