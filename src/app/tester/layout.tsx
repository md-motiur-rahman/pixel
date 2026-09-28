import { AppShell } from "@/components/app-shell";
import { getCurrentProfile } from "@/lib/get-current-profile";

export default async function TesterLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  return (
    <AppShell
      title="Tester"
      subtitle="Log a tested camera and print its label"
      isAdmin={profile?.role === "admin"}
    >
      <div className="mx-auto max-w-xl print:max-w-none">{children}</div>
    </AppShell>
  );
}
