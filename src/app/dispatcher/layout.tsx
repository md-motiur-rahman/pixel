import { AppShell } from "@/components/app-shell";
import { getCurrentProfile } from "@/lib/get-current-profile";

export default async function DispatcherLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  return (
    <AppShell
      title="Dispatcher"
      subtitle="Scan to look up or pick a camera"
      isAdmin={profile?.role === "admin"}
    >
      <div className="mx-auto max-w-xl">{children}</div>
    </AppShell>
  );
}
