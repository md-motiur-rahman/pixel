"use client";

import { Select } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { ColorPill } from "@/components/color-pill";
import { fieldClasses } from "@/components/ui";
import { CAMERA_COLORS, findColor } from "@/lib/colors";
import { cn } from "@/lib/cn";

// Colour picker: each option is shown as its coloured pill. Keyboard and
// screen-reader friendly (Radix Select), and the list floats above the page.
export function ColorSelect({
  value,
  onValueChange,
  id,
  disabled,
}: {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
}) {
  // A saved item can carry an older, free-typed colour that isn't in the list —
  // keep it selectable so opening and re-saving doesn't silently change it.
  const legacy = value && !findColor(value) ? value : null;
  const selected = findColor(value)?.name ?? value;

  return (
    <Select.Root value={selected} onValueChange={onValueChange} disabled={disabled}>
      <Select.Trigger
        id={id}
        aria-label="Color"
        className={cn(fieldClasses, "flex cursor-pointer items-center justify-between gap-2 text-left")}
      >
        <Select.Value placeholder={<span className="text-fg-subtle">Select a color</span>} />
        <Select.Icon asChild>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className="glass-strong z-50 max-h-(--radix-select-content-available-height) w-(--radix-select-trigger-width) min-w-44 overflow-hidden rounded-2xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95"
        >
          <Select.Viewport className="max-h-[min(22rem,var(--radix-select-content-available-height))] overflow-y-auto p-1.5">
            {legacy && <ColorItem value={legacy} />}
            {CAMERA_COLORS.map((c) => (
              <ColorItem key={c.name} value={c.name} />
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function ColorItem({ value }: { value: string }) {
  return (
    <Select.Item
      value={value}
      className="relative flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2.5 py-1.5 outline-none select-none data-[highlighted]:bg-glass-hover"
    >
      <Select.ItemText asChild>
        <span>
          <ColorPill color={value} />
        </span>
      </Select.ItemText>
      <Select.ItemIndicator>
        <Check aria-hidden="true" className="size-4 text-accent" />
      </Select.ItemIndicator>
    </Select.Item>
  );
}
