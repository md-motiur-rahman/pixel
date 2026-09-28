import { AppShell } from "@/components/app-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Only an admin can ever reach this layout (middleware enforces it), so the
  // cross-section switcher inside AppShell is always relevant here.
  return (
    <AppShell title="Admin" subtitle="Users & catalog management" isAdmin>
      <div className="mx-auto max-w-3xl">{children}</div>
    </AppShell>
  );
}
