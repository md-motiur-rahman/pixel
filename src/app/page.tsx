import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/types/database";

const ROLE_HOME: Record<Role, string> = {
  admin: "/admin/inventory",
  tester: "/tester",
  dispatcher: "/dispatcher",
  checker: "/checker",
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  redirect(profile ? ROLE_HOME[profile.role] : "/login");
}
