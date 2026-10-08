import { AppShell } from "@/components/app-shell";
import { getCurrentProfile } from "@/lib/get-current-profile";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  return (
    <AppShell role={profile?.role ?? null}>
      <div className="mx-auto max-w-3xl">{children}</div>
    </AppShell>
  );
}
