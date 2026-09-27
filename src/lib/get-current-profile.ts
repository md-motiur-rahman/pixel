import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/types/database";

export async function getCurrentProfile(): Promise<{ role: Role; fullName: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!data) return null;

  return { role: data.role, fullName: data.full_name };
}
