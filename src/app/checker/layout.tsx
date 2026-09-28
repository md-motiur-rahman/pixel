import { AppShell } from "@/components/app-shell";
import { getCurrentProfile } from "@/lib/get-current-profile";

export default async function CheckerLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  return (
    <AppShell
      title="Checker"
      subtitle="Scan shelves and compare against the system"
      isAdmin={profile?.role === "admin"}
    >
      <div className="mx-auto max-w-3xl">{children}</div>
    </AppShell>
  );
}
