"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, redirectOrigin } from "@/lib/admin-auth";
import { isRole, sortRoles } from "@/lib/roles";
import type { Role } from "@/types/database";

type ActionResult = { ok: true } | { ok: false; error: string };

// A person can hold several roles. Whatever the browser sends is reduced to real,
// distinct roles in a fixed order (admin first), and at least one is required.
function cleanRoles(input: unknown): { ok: true; roles: Role[] } | { ok: false; error: string } {
  const roles = sortRoles(Array.isArray(input) ? input.filter(isRole) : []);
  if (roles.length === 0) return { ok: false, error: "Pick at least one role." };
  return { ok: true, roles };
}

export async function updateUserRoles(userId: string, roles: Role[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const checked = cleanRoles(roles);
  if (!checked.ok) return checked;
  if (userId === admin.userId && !checked.roles.includes("admin")) {
    return { ok: false, error: "You can't remove your own admin role." };
  }

  // The database keeps the person's primary `role` in step with this list.
  const { error } = await admin.supabase.from("profiles").update({ roles: checked.roles }).eq("id", userId);
  if (error) {
    // 42703 / PGRST204: there is no `roles` column — the migration hasn't been run.
    if (error.code === "42703" || error.code === "PGRST204") {
      return {
        ok: false,
        error: "Several roles need a database update — run supabase/migration_9_multi_role_master_stock.sql in Supabase.",
      };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin");
  return { ok: true };
}

export async function inviteStaff(email: string, fullName: string, roles: Role[]): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const checked = cleanRoles(roles);
  if (!checked.ok) return checked;

  const redirectTo = `${await redirectOrigin()}/set-password`;
  const adminClient = createAdminClient();
  // `role` (the primary one) is kept alongside `roles` for a database that
  // hasn't had the multi-role migration run yet.
  const { error } = await adminClient.auth.admin.inviteUserByEmail(email.trim(), {
    data: { full_name: fullName.trim(), role: checked.roles[0], roles: checked.roles },
    redirectTo,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function resendAccess(email: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const redirectTo = `${await redirectOrigin()}/set-password`;
  const { error } = await admin.supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deactivateStaff(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  if (userId === admin.userId) return { ok: false, error: "You can't deactivate your own account." };

  const adminClient = createAdminClient();
  const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
  });
  if (banError) return { ok: false, error: banError.message };

  const { error } = await admin.supabase.from("profiles").update({ is_active: false }).eq("id", userId);
  if (error) {
    // Don't leave the two states out of sync — undo the ban rather than
    // silently locking someone out while the UI still shows them active.
    await adminClient.auth.admin.updateUserById(userId, { ban_duration: "none" });
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteStaff(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  if (userId === admin.userId) return { ok: false, error: "You can't delete your own account." };

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) {
    // profiles.id cascades on delete, but units.tester_id/picked_by and
    // stock_counts.checker_id reference profiles WITHOUT cascading — by
    // design (see schema.sql), so a staff member's testing/picking/checking
    // history survives them leaving. That FK restriction surfaces here as a
    // Postgres error; translate it into the actual next step for the admin.
    const message = error.message.toLowerCase();
    if (message.includes("foreign key") || message.includes("violates") || message.includes("constraint")) {
      return {
        ok: false,
        error:
          "Can't delete — this person has tested, picked, or checked cameras on record. Deactivate them instead to keep that history.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin");
  return { ok: true };
}

export async function reactivateStaff(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const adminClient = createAdminClient();
  const { error: unbanError } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });
  if (unbanError) return { ok: false, error: unbanError.message };

  const { error } = await admin.supabase.from("profiles").update({ is_active: true }).eq("id", userId);
  if (error) {
    // Same rollback in reverse — don't leave them unbanned but still
    // flagged inactive in the UI.
    await adminClient.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin");
  return { ok: true };
}
