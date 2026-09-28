"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { SignOutButton } from "@/components/sign-out-button";

const SECTIONS = [
  { href: "/tester", label: "Tester" },
  { href: "/dispatcher", label: "Dispatcher" },
  { href: "/checker", label: "Checker" },
  { href: "/admin", label: "Admin" },
];

const ADMIN_TABS = [
  { href: "/admin", label: "Staff" },
  { href: "/admin/catalog", label: "Catalog" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/export", label: "Export" },
];

export function AppShell({
  title,
  subtitle,
  isAdmin,
  children,
}: {
  title: string;
  subtitle?: string;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const inAdmin = pathname.startsWith("/admin");

  return (
    <div className="min-h-dvh bg-neutral-50 print:min-h-0 sm:flex">
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 print:hidden sm:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="-ml-2 flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm font-medium text-neutral-700 active:bg-neutral-100"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0">
            <path
              fillRule="evenodd"
              d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
              clipRule="evenodd"
            />
          </svg>
          Menu
        </button>
        <p className="truncate text-sm font-semibold text-neutral-900">{title}</p>
        <SignOutButton />
      </div>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 sm:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-neutral-900 text-neutral-100 transition-transform print:hidden",
          "sm:sticky sm:top-0 sm:h-dvh sm:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="px-5 py-5">
          <p className="text-sm font-semibold tracking-tight text-white">Pixel Direct</p>
          <p className="mt-0.5 truncate text-xs text-neutral-400">
            {title}
            {subtitle ? ` · ${subtitle}` : ""}
          </p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {isAdmin &&
            SECTIONS.map((s) => {
              const active = s.href === "/admin" ? inAdmin : pathname.startsWith(s.href);
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-neutral-300 hover:bg-neutral-800 hover:text-white"
                  )}
                >
                  {s.label}
                </Link>
              );
            })}

          {inAdmin && (
            <div className={cn("space-y-1", isAdmin && "mt-3 border-t border-neutral-800 pt-3")}>
              {ADMIN_TABS.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  onClick={() => setOpen(false)}
                  aria-current={pathname === t.href ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-3 py-2 pl-5 text-sm font-medium transition-colors",
                    pathname === t.href
                      ? "bg-indigo-600/90 text-white shadow-sm"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </div>
          )}
        </nav>

        <div className="hidden border-t border-neutral-800 px-3 py-3 sm:block">
          <SignOutButton className="w-full justify-start text-neutral-300 hover:bg-neutral-800 hover:text-white" />
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 print:m-0 print:p-0 sm:px-6 sm:py-6">
        {children}
      </main>
    </div>
  );
}
