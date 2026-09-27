"use client";

import { useState, useTransition } from "react";
import { updateUserRole, resendAccess, deactivateStaff, reactivateStaff } from "./actions";
import type { Role } from "@/types/database";
import { Button, Select } from "@/components/ui";
import { cn } from "@/lib/cn";

const ROLES: Role[] = ["tester", "dispatcher", "checker", "admin"];

export function StaffRow({
  userId,
  fullName,
  email,
  currentRole,
  isActive,
}: {
  userId: string;
  fullName: string;
  email: string;
  currentRole: Role;
  isActive: boolean;
}) {
  const [role, setRole] = useState(currentRole);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", isActive ? "bg-emerald-500" : "bg-neutral-300")} />
          <p className="truncate text-sm font-medium text-neutral-900">{fullName}</p>
          {!isActive && <span className="shrink-0 text-xs text-neutral-400">deactivated</span>}
        </div>
        <p className="truncate pl-3.5 text-xs text-neutral-500">{email}</p>
        {message && <p className="pl-3.5 text-xs text-neutral-500">{message}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={role}
          disabled={isPending || !isActive}
          onChange={(e) => {
            const previousRole = role;
            const next = e.target.value as Role;
            setRole(next);
            setMessage(null);
            startTransition(async () => {
              const result = await updateUserRole(userId, next);
              if (!result.ok) {
                setRole(previousRole);
                setMessage(result.error);
              }
            });
          }}
          className="min-h-9 w-auto py-1 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>

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
      </div>
    </li>
  );
}
