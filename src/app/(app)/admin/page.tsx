import { createClient } from "@/lib/supabase/server";
import { normalizeRoles } from "@/lib/roles";
import { StaffRow } from "./staff-row";
import { InviteForm } from "./invite-form";
import { Card } from "@/components/ui";

export default async function AdminPage() {
  const supabase = await createClient();
  // `roles` only exists once migration_9 has been run; until then fall back to the single `role`.
  const withRoles = await supabase
    .from("profiles")
    .select("id, full_name, email, role, roles, is_active, created_at")
    .order("created_at", { ascending: false });
  const users = withRoles.error
    ? (
        await supabase
          .from("profiles")
          .select("id, full_name, email, role, is_active, created_at")
          .order("created_at", { ascending: false })
      ).data
    : withRoles.data;

  return (
    <Card className="mx-auto w-full max-w-3xl overflow-hidden">
      <div className="border-b border-line px-4 py-4 sm:px-5">
        <h2 className="text-sm font-semibold text-fg">Invite staff</h2>
        <p className="mt-0.5 text-sm text-fg-muted">
          They&rsquo;ll get an email to set their own password and sign in. Give someone several roles to let them do
          several jobs.
        </p>
      </div>
      <InviteForm />
      <ul className="divide-y divide-line-soft">
        {(users ?? []).map((u) => (
          <StaffRow
            key={u.id}
            userId={u.id}
            fullName={u.full_name}
            email={u.email}
            currentRoles={normalizeRoles("roles" in u ? u.roles : null, u.role)}
            isActive={u.is_active}
          />
        ))}
        {(!users || users.length === 0) && (
          <li className="px-4 py-6 text-center text-sm text-fg-muted sm:px-5">No staff accounts yet.</li>
        )}
      </ul>
    </Card>
  );
}
