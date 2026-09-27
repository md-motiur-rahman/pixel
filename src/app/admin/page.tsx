import { createClient } from "@/lib/supabase/server";
import { StaffRow } from "./staff-row";
import { InviteForm } from "./invite-form";
import { Card } from "@/components/ui";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: users } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active, created_at")
    .order("created_at", { ascending: false });

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-neutral-200 px-4 py-4 sm:px-5">
        <h2 className="text-sm font-semibold text-neutral-900">Invite staff</h2>
        <p className="mt-0.5 text-sm text-neutral-500">
          They&rsquo;ll get an email to set their own password and sign in.
        </p>
      </div>
      <InviteForm />
      <ul className="divide-y divide-neutral-100">
        {(users ?? []).map((u) => (
          <StaffRow
            key={u.id}
            userId={u.id}
            fullName={u.full_name}
            email={u.email}
            currentRole={u.role}
            isActive={u.is_active}
          />
        ))}
        {(!users || users.length === 0) && (
          <li className="px-4 py-6 text-center text-sm text-neutral-500 sm:px-5">No staff accounts yet.</li>
        )}
      </ul>
    </Card>
  );
}
