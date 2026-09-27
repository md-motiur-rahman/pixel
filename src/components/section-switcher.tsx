import Link from "next/link";
import { cn } from "@/lib/cn";

const SECTIONS = [
  { href: "/tester", label: "Tester" },
  { href: "/dispatcher", label: "Dispatcher" },
  { href: "/checker", label: "Checker" },
  { href: "/admin", label: "Admin" },
];

// Only an admin's role can actually reach every section (RLS + middleware
// both allow it) — this is just the missing navigation for that, rendered
// only when the caller already knows the signed-in user is an admin.
export function SectionSwitcher({ current }: { current: string }) {
  return (
    <nav className="overflow-x-auto border-b border-neutral-200 bg-neutral-50">
      <div className="flex gap-1 px-4 sm:px-6">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={cn(
              "shrink-0 px-2 py-2 text-xs font-medium transition-colors",
              s.href === current ? "text-indigo-600" : "text-neutral-500 hover:text-neutral-900"
            )}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
