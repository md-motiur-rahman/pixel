"use client";

import { useState } from "react";
import { inviteStaff } from "./actions";
import type { Role } from "@/types/database";
import { Button, Field, Input, Message } from "@/components/ui";
import { RolePicker } from "./role-picker";

export function InviteForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<Role[]>(["tester"]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const result = await inviteStaff(email, fullName, roles);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(`Invite sent to ${email}.`);
    setFullName("");
    setEmail("");
    setRoles(["tester"]);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-b border-line p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Full name">
          <Input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>

      <Field label="Roles" hint="Pick every role they need — they get all of those screens.">
        <RolePicker value={roles} onChange={setRoles} disabled={submitting} />
      </Field>

      <Button type="submit" disabled={submitting || roles.length === 0} className="w-full sm:w-auto">
        {submitting ? "Sending…" : "Send invite"}
      </Button>

      {error && <Message variant="error">{error}</Message>}
      {success && <Message variant="success">{success}</Message>}
    </form>
  );
}
