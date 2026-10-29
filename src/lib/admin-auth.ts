import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { fetchProfileRoles } from "@/lib/roles";

export async function requireAdmin() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return { ok: false as const, error: "Not signed in." };

  const caller = await fetchProfileRoles(supabase, user.id);
  if (!caller?.roles.includes("admin")) return { ok: false as const, error: "Only an admin can do that." };

  return { ok: true as const, supabase, userId: user.id };
}

export async function redirectOrigin() {
  const host = (await headers()).get("host")!;
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}
