"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, redirectOrigin } from "@/lib/admin-auth";
import type { Role } from "@/types/database";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateUserRole(userId: string, role: Role): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  if (userId === admin.userId && role !== "admin") {
    return { ok: false, error: "You can't remove your own admin role." };
  }

  const { error } = await admin.supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function inviteStaff(email: string, fullName: string, role: Role): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const redirectTo = `${await redirectOrigin()}/set-password`;
  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.inviteUserByEmail(email.trim(), {
    data: { full_name: fullName.trim(), role },
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
