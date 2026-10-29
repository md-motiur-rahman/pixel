import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { fetchProfileRoles } from "@/lib/roles";
import type { Role } from "@/types/database";

// cache(): the layout and any page in the same request share one lookup.
// `roles` is every role the person holds, admin first when they have it.
export const getCurrentProfile = cache(async (): Promise<{ roles: Role[]; fullName: string } | null> => {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) return null;

  const profile = await fetchProfileRoles(supabase, user.id);
  if (!profile || profile.roles.length === 0) return null;

  return { roles: profile.roles, fullName: profile.fullName };
});
