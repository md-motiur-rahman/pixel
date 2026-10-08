import { AppShell } from "@/components/app-shell";
import { getCurrentProfile } from "@/lib/get-current-profile";

export default async function TesterLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  return (
    <AppShell role={profile?.role ?? null}>
      <div className="mx-auto max-w-xl print:max-w-none">{children}</div>
    </AppShell>
  );
}
