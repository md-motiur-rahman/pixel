import { SignOutButton } from "@/components/sign-out-button";

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold tracking-tight text-neutral-900">{title}</h1>
          {subtitle && <p className="truncate text-sm text-neutral-500">{subtitle}</p>}
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}
