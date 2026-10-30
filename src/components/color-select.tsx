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
  suggested = [],
}: {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  /** Colours to list first (e.g. the ones this model is known in), then a divider, then the rest. */
  suggested?: string[];
}) {
  const selected = findColor(value)?.name ?? value;
  const top = [...new Set(suggested.map((c) => findColor(c)?.name ?? c.trim()).filter(Boolean))];
  const inTop = new Set(top.map((c) => c.toLowerCase()));
  const rest = CAMERA_COLORS.map((c) => c.name).filter((name) => !inTop.has(name.toLowerCase()));
  // A saved item can carry an older, free-typed colour that isn't in the list —
  // keep it selectable so opening and re-saving doesn't silently change it.
  const legacy = value && !findColor(value) && !inTop.has(value.toLowerCase()) ? value : null;

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
            {top.length > 0 ? (
              <>
                <Select.Group>
                  <Select.Label className="px-2.5 pt-1 pb-1.5 text-[11px] font-medium text-fg-subtle">
                    This model&rsquo;s colours
                  </Select.Label>
                  {top.map((name) => (
                    <ColorItem key={name} value={name} />
                  ))}
                </Select.Group>
                <Select.Separator className="mx-1 my-1.5 h-px bg-line" />
                <Select.Group>
                  <Select.Label className="px-2.5 pt-1 pb-1.5 text-[11px] font-medium text-fg-subtle">
                    Other colours
                  </Select.Label>
                  {rest.map((name) => (
                    <ColorItem key={name} value={name} />
                  ))}
                </Select.Group>
              </>
            ) : (
              rest.map((name) => <ColorItem key={name} value={name} />)
            )}
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
