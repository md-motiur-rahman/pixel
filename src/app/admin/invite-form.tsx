"use client";

import { useState } from "react";
import { inviteStaff } from "./actions";
import type { Role } from "@/types/database";
import { Button, Field, Input, Message, Select } from "@/components/ui";

const ROLES: Role[] = ["tester", "dispatcher", "checker", "admin"];

export function InviteForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("tester");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const result = await inviteStaff(email, fullName, role);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(`Invite sent to ${email}.`);
    setFullName("");
    setEmail("");
    setRole("tester");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-b border-neutral-200 p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
        <Field label="Full name">
          <Input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)} className="sm:w-32">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? "Sending…" : "Send invite"}
      </Button>

      {error && <Message variant="error">{error}</Message>}
      {success && <Message variant="success">{success}</Message>}
    </form>
  );
}
