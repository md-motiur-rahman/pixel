import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "admin") return { ok: false as const, error: "Only an admin can do that." };

  return { ok: true as const, supabase, userId: user.id };
}

export async function redirectOrigin() {
  const host = (await headers()).get("host")!;
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}
