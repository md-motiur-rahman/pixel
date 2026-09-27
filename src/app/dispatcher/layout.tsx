import { SectionHeader } from "@/components/section-header";
import { SectionSwitcher } from "@/components/section-switcher";
import { getCurrentProfile } from "@/lib/get-current-profile";

export default async function DispatcherLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  return (
    <div className="min-h-dvh bg-neutral-50">
      <SectionHeader title="Dispatcher" subtitle="Scan to look up or pick a camera" />
      {profile?.role === "admin" && <SectionSwitcher current="/dispatcher" />}
      <main className="mx-auto max-w-xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
