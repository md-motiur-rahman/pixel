import { SectionHeader } from "@/components/section-header";
import { SectionSwitcher } from "@/components/section-switcher";
import { AdminNav } from "./admin-nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-neutral-50">
      <SectionHeader title="Admin" subtitle="Users & catalog management" />
      {/* Only an admin can ever reach this layout (middleware enforces it), so
          the switcher is always relevant here — no role check needed. */}
      <SectionSwitcher current="/admin" />
      <AdminNav />
      <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
