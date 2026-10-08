import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-user";
import type { Role } from "@/types/database";

// cache(): the layout and any page in the same request share one lookup.
export const getCurrentProfile = cache(async (): Promise<{ role: Role; fullName: string } | null> => {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return null;

  const { data } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!data) return null;

  return { role: data.role, fullName: data.full_name };
});
