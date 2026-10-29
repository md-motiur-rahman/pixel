import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { normalizeRoles } from "@/lib/roles";
import { StaffScreen } from "./staff-screen";
import type { StaffMember } from "./staff-ui";

export default async function AdminPage() {
  const supabase = await createClient();
  const [user, withRoles] = await Promise.all([
    getAuthUser(supabase),
    supabase
      .from("profiles")
      .select("id, full_name, email, role, roles, is_active, created_at")
      .order("created_at", { ascending: false }),
  ]);
  // `roles` only exists once migration_9 has been run; until then fall back to the single `role`.
  const users = withRoles.error
    ? (
        await supabase
          .from("profiles")
          .select("id, full_name, email, role, is_active, created_at")
          .order("created_at", { ascending: false })
      ).data
    : withRoles.data;

  const members: StaffMember[] = (users ?? []).map((u) => ({
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    roles: normalizeRoles("roles" in u ? u.roles : null, u.role),
    isActive: u.is_active,
    createdAt: u.created_at,
  }));

  return <StaffScreen members={members} currentUserId={user?.id ?? null} />;
}
