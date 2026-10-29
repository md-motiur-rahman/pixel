import { AppShell } from "@/components/app-shell";
import { getCurrentProfile } from "@/lib/get-current-profile";

// One shell for every signed-in section. Living above admin/tester/dispatcher/
// checker (a route group — it doesn't change any URL) means switching sections
// keeps the sidebar mounted and only renders the new page, instead of
// rebuilding the whole shell on every click.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  return <AppShell roles={profile?.roles ?? []}>{children}</AppShell>;
}
