"use client";

import { Check } from "lucide-react";
import type { Role } from "@/types/database";
import { ALL_ROLES, ROLE_LABEL, sortRoles } from "@/lib/roles";
import { cn } from "@/lib/cn";

// A person can hold several roles, so this is a set of toggles rather than a
// dropdown. The list handed back is always in the fixed role order.
export function RolePicker({
  value,
  onChange,
  disabled,
  label = "Roles",
  id,
}: {
  value: Role[];
  onChange: (roles: Role[]) => void;
  disabled?: boolean;
  label?: string;
  /** Set by <Field> so its label points at this group. */
  id?: string;
}) {
  function toggle(role: Role) {
    const next = value.includes(role) ? value.filter((r) => r !== role) : [...value, role];
    onChange(sortRoles(next));
  }

  return (
    <div id={id} role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {ALL_ROLES.map((role) => {
        const on = value.includes(role);
        return (
          <button
            key={role}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => toggle(role)}
            className={cn(
              "inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-50",
              on
                ? "border-accent bg-accent text-white"
                : "border-line bg-glass-soft text-fg-muted hover:bg-glass-hover hover:text-fg"
            )}
          >
            {on && <Check aria-hidden="true" className="size-3.5" />}
            {ROLE_LABEL[role]}
          </button>
        );
      })}
    </div>
  );
}
