import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth-user";
import { fetchProfileRoles, homeFor } from "@/lib/roles";

export default async function Home() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);

  if (!user) redirect("/login");

  const profile = await fetchProfileRoles(supabase, user.id);
  redirect((profile && homeFor(profile.roles)) || "/login");
}
