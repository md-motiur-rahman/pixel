"use client";

import { useState } from "react";
import type { Role } from "@/types/database";
import { Button, Field, Input, Message } from "@/components/ui";
import { inviteStaff } from "./actions";
import { RolePicker } from "./role-picker";
import { StaffDialog } from "./staff-ui";

export function InviteDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: (message: string) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<Role[]>(["tester"]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setFullName("");
    setEmail("");
    setRoles(["tester"]);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await inviteStaff(email, fullName, roles);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onInvited(`Invite sent to ${email.trim()}.`);
      reset();
      onOpenChange(false);
    } catch {
      setError("Could not send the invite — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StaffDialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Invite staff"
      description="They'll get an email to set their own password and sign in."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Full name">
            <Input
              type="text"
              name="invite-name"
              autoComplete="off"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              name="invite-email"
              autoComplete="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Roles" hint="Pick every job they do — they get each of those screens.">
          <RolePicker value={roles} onChange={setRoles} disabled={submitting} />
        </Field>

        {error && <Message variant="error">{error}</Message>}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || roles.length === 0}>
            {submitting ? "Sending…" : "Send invite"}
          </Button>
        </div>
      </form>
    </StaffDialog>
  );
}
