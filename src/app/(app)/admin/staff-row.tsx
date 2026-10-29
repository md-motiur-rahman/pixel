"use client";

import { useState, useTransition } from "react";
import { updateUserRoles, resendAccess, deactivateStaff, reactivateStaff, deleteStaff } from "./actions";
import type { Role } from "@/types/database";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { RolePicker } from "./role-picker";

function sameRoles(a: Role[], b: Role[]) {
  return a.length === b.length && a.every((role) => b.includes(role));
}

export function StaffRow({
  userId,
  fullName,
  email,
  currentRoles,
  isActive,
}: {
  userId: string;
  fullName: string;
  email: string;
  currentRoles: Role[];
  isActive: boolean;
}) {
  // `savedRoles` is what's stored; `roles` is the draft being edited.
  const [savedRoles, setSavedRoles] = useState(currentRoles);
  const [roles, setRoles] = useState(currentRoles);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const changed = !sameRoles(roles, savedRoles);

  return (
    <li className="space-y-3 px-4 py-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", isActive ? "bg-success" : "bg-fg-subtle")} />
            <p className="truncate text-sm font-medium text-fg">{fullName}</p>
            {!isActive && <span className="shrink-0 text-xs text-fg-subtle">deactivated</span>}
          </div>
          <p className="truncate pl-3.5 text-xs text-fg-muted">{email}</p>
          {message && <p className="pl-3.5 text-xs text-fg-muted">{message}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={isPending || !isActive}
            onClick={() => {
              setMessage(null);
              startTransition(async () => {
                const result = await resendAccess(email);
                setMessage(result.ok ? "Sent." : result.error);
              });
            }}
          >
            Resend access
          </Button>

          {isActive ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const result = await deactivateStaff(userId);
                  if (!result.ok) setMessage(result.error);
                });
              }}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={isPending}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const result = await reactivateStaff(userId);
                  if (!result.ok) setMessage(result.error);
                });
              }}
            >
              Reactivate
            </Button>
          )}

          {confirmingDelete ? (
            <>
              <Button
                size="sm"
                variant="destructive"
                disabled={isPending}
                onClick={() => {
                  setMessage(null);
                  startTransition(async () => {
                    const result = await deleteStaff(userId);
                    if (!result.ok) {
                      setMessage(result.error);
                      setConfirmingDelete(false);
                    }
                  });
                }}
              >
                Confirm delete
              </Button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setConfirmingDelete(false)}
                className="text-sm text-fg-muted hover:text-fg"
              >
                Cancel
              </button>
            </>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                setMessage(null);
                setConfirmingDelete(true);
              }}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-3.5">
        <RolePicker value={roles} onChange={setRoles} disabled={isPending || !isActive} label={`Roles for ${fullName}`} />
        {changed && (
          <>
            <Button
              size="sm"
              disabled={isPending || roles.length === 0}
              onClick={() => {
                setMessage(null);
                startTransition(async () => {
                  const result = await updateUserRoles(userId, roles);
                  if (result.ok) {
                    setSavedRoles(roles);
                    setMessage("Roles saved.");
                  } else {
                    setMessage(result.error);
                  }
                });
              }}
            >
              {isPending ? "Saving…" : "Save roles"}
            </Button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setRoles(savedRoles);
                setMessage(null);
              }}
              className="text-sm text-fg-muted hover:text-fg"
            >
              Undo
            </button>
          </>
        )}
      </div>
    </li>
  );
}
