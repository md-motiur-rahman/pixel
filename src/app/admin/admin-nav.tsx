"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/admin", label: "Staff" },
  { href: "/admin/catalog", label: "Catalog" },
  { href: "/admin/export", label: "Export" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="overflow-x-auto border-b border-neutral-200 bg-white">
      <div className="flex gap-1 px-4 sm:px-6">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "shrink-0 border-b-2 px-2 py-3 text-sm font-medium transition-colors",
              pathname === tab.href
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-neutral-500 hover:text-neutral-900"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
