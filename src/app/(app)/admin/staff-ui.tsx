"use client";

import type { ReactNode } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import type { Role } from "@/types/database";
import { ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/cn";

// Small shared pieces for the Staff page.

export type StaffMember = {
  id: string;
  fullName: string;
  email: string;
  roles: Role[];
  isActive: boolean;
  createdAt: string;
};

// One colour family per kind of work, so a list of people scans at a glance.
const ROLE_TONE: Record<Role, string> = {
  admin: "border-accent/30 bg-accent/10 text-accent",
  tester: "border-success-line bg-success-soft text-success",
  dispatcher: "border-warn-line bg-warn-soft text-warn",
  checker: "border-line bg-glass-soft text-fg-muted",
  data_entry: "border-line bg-glass-soft text-fg-muted",
  master_stocker: "border-accent/20 bg-accent/5 text-accent",
  repair: "border-danger-line bg-danger-soft text-danger",
  clearance: "border-warn-line bg-warn-soft text-warn",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        ROLE_TONE[role]
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

export function Avatar({ name, muted }: { name: string; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
        muted ? "bg-glass-hover text-fg-subtle" : "bg-accent text-white"
      )}
    >
      {initials(name)}
    </span>
  );
}

// The app's standard centred modal, with a title, optional description and close button.
export function StaffDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          // Without a description, tell Radix there's nothing to describe it (no console warning).
          {...(description ? {} : { "aria-describedby": undefined })}
          className="glass-strong fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl p-6 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold text-fg">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-sm text-fg-muted">{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-fg-muted outline-none transition-colors hover:bg-glass-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </Dialog.Close>
          </div>
          <div className="mt-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
