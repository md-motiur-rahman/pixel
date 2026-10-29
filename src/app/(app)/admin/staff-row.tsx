"use client";

import { useState, useTransition } from "react";
import { DropdownMenu } from "radix-ui";
import { Mail, MoreHorizontal, ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";
import type { Role } from "@/types/database";
import { Button, Message } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { cn } from "@/lib/cn";
import { updateUserRoles, resendAccess, deactivateStaff, reactivateStaff, deleteStaff } from "./actions";
import { RolePicker } from "./role-picker";
import { Avatar, RoleBadge, StaffDialog, type StaffMember } from "./staff-ui";

type Notify = (message: string, tone: "success" | "error") => void;

function sameRoles(a: Role[], b: Role[]) {
  return a.length === b.length && a.every((role) => b.includes(role));
}

const itemClass =
  "flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-fg outline-none transition-colors data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-glass-hover [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-subtle";

export function StaffRow({ member, isYou, onNotify }: { member: StaffMember; isYou: boolean; onNotify: Notify }) {
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<null | "roles" | "deactivate" | "delete">(null);
  const [draftRoles, setDraftRoles] = useState<Role[]>(member.roles);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const joined = new Date(member.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  function close() {
    setDialog(null);
    setDialogError(null);
  }

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string, inDialog: boolean) {
    setDialogError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          if (inDialog) setDialogError(result.error);
          else onNotify(result.error, "error");
          return;
        }
        close();
        onNotify(success, "success");
      } catch {
        const message = "Something went wrong — check your connection and try again.";
        if (inDialog) setDialogError(message);
        else onNotify(message, "error");
      }
    });
  }

  return (
    <li
      className={cn(
        "grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,2fr)_7rem_7rem_2.5rem] lg:gap-x-4",
        !member.isActive && "bg-glass-soft/50"
      )}
    >
      {/* Member */}
      <div className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
        <Avatar name={member.fullName} muted={!member.isActive} />
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm font-medium text-fg">
            <span className="truncate">{member.fullName}</span>
            {isYou && (
              <span className="shrink-0 rounded-full bg-glass-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted">
                You
              </span>
            )}
          </p>
          <p className="truncate text-xs text-fg-muted">{member.email}</p>
        </div>
      </div>

      {/* Actions (top-right on small screens, last column on large ones) */}
      <div className="col-start-3 row-start-1 justify-self-end lg:col-start-5">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              aria-label={`Actions for ${member.fullName}`}
              className="size-9 px-0"
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              collisionPadding={12}
              className="glass-strong z-50 min-w-52 rounded-2xl p-1.5 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95"
            >
              <DropdownMenu.Item
                className={itemClass}
                disabled={!member.isActive}
                onSelect={() => {
                  setDraftRoles(member.roles);
                  setDialog("roles");
                }}
              >
                <ShieldCheck aria-hidden="true" />
                Edit roles
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={itemClass}
                disabled={!member.isActive}
                onSelect={() => run(() => resendAccess(member.email), `Access email sent to ${member.email}.`, false)}
              >
                <Mail aria-hidden="true" />
                Resend access email
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
              {member.isActive ? (
                <DropdownMenu.Item className={itemClass} disabled={isYou} onSelect={() => setDialog("deactivate")}>
                  <UserX aria-hidden="true" />
                  Deactivate
                </DropdownMenu.Item>
              ) : (
                <DropdownMenu.Item
                  className={itemClass}
                  onSelect={() => run(() => reactivateStaff(member.id), `${member.fullName} can sign in again.`, false)}
                >
                  <UserCheck aria-hidden="true" />
                  Reactivate
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Item
                className={cn(itemClass, "text-danger [&_svg]:text-danger")}
                disabled={isYou}
                onSelect={() => setDialog("delete")}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Roles */}
      <div className="col-span-3 flex flex-wrap gap-1.5 pl-[52px] lg:col-span-1 lg:pl-0">
        {member.roles.map((role) => (
          <RoleBadge key={role} role={role} />
        ))}
      </div>

      {/* Status */}
      <div className="col-span-3 flex items-center gap-3 pl-[52px] text-xs lg:col-span-1 lg:block lg:pl-0">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-medium",
            member.isActive ? "text-success" : "text-fg-subtle"
          )}
        >
          <span className={cn("size-1.5 rounded-full", member.isActive ? "bg-success" : "bg-fg-subtle")} />
          {member.isActive ? "Active" : "Deactivated"}
        </span>
        <span className="text-fg-subtle lg:hidden" suppressHydrationWarning>
          · Joined {joined}
        </span>
      </div>

      {/* Joined */}
      <p className="hidden text-xs text-fg-muted lg:block" suppressHydrationWarning>
        {joined}
      </p>

      {/* Edit roles */}
      <StaffDialog
        open={dialog === "roles"}
        onOpenChange={(open) => !open && !isPending && close()}
        title={`Roles for ${member.fullName}`}
        description="They get every screen of each role they hold. Admin includes everything."
      >
        <div className="space-y-4">
          <RolePicker value={draftRoles} onChange={setDraftRoles} disabled={isPending} label={`Roles for ${member.fullName}`} />
          {isYou && !draftRoles.includes("admin") && (
            <Message variant="warning">You can&rsquo;t remove your own admin role.</Message>
          )}
          {dialogError && <Message variant="error">{dialogError}</Message>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" disabled={isPending} onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                isPending ||
                draftRoles.length === 0 ||
                sameRoles(draftRoles, member.roles) ||
                (isYou && !draftRoles.includes("admin"))
              }
              onClick={() => run(() => updateUserRoles(member.id, draftRoles), `Roles updated for ${member.fullName}.`, true)}
            >
              {isPending ? "Saving…" : "Save roles"}
            </Button>
          </div>
        </div>
      </StaffDialog>

      <ConfirmDialog
        open={dialog === "deactivate"}
        onOpenChange={(open) => !open && close()}
        title={`Deactivate ${member.fullName}?`}
        description={
          <p>
            They&rsquo;re signed out and can&rsquo;t sign in again until reactivated. Everything they tested, picked or
            counted stays on record.
          </p>
        }
        confirmLabel="Deactivate"
        destructive
        busy={isPending}
        error={dialogError}
        onConfirm={() => run(() => deactivateStaff(member.id), `${member.fullName} has been deactivated.`, true)}
      />

      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && close()}
        title={`Delete ${member.fullName}?`}
        description={
          <>
            <p className="font-medium text-danger">This removes their account for good.</p>
            <p>
              Someone who has tested, picked or counted cameras can&rsquo;t be deleted — deactivate them instead to keep
              that history.
            </p>
          </>
        }
        confirmLabel="Delete account"
        destructive
        busy={isPending}
        error={dialogError}
        onConfirm={() => run(() => deleteStaff(member.id), `${member.fullName} has been deleted.`, true)}
      />
    </li>
  );
}
