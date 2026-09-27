import { SectionHeader } from "@/components/section-header";
import { SectionSwitcher } from "@/components/section-switcher";
import { getCurrentProfile } from "@/lib/get-current-profile";

export default async function TesterLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  return (
    <div className="min-h-dvh bg-neutral-50">
      <SectionHeader title="Tester" subtitle="Log a tested camera and print its label" />
      {profile?.role === "admin" && <SectionSwitcher current="/tester" />}
      <main className="mx-auto max-w-xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
