import { SectionHeader } from "@/components/section-header";
import { SectionSwitcher } from "@/components/section-switcher";
import { getCurrentProfile } from "@/lib/get-current-profile";

export default async function CheckerLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  return (
    <div className="min-h-dvh bg-neutral-50">
      <SectionHeader title="Checker" subtitle="Scan shelves and compare against the system" />
      {profile?.role === "admin" && <SectionSwitcher current="/checker" />}
      <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
