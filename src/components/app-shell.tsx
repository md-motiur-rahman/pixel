"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog, DropdownMenu, VisuallyHidden } from "radix-ui";
import { motion } from "motion/react";
import {
  Aperture,
  Check,
  ChevronDown,
  BookOpen,
  ClipboardCheck,
  FileDown,
  FlaskConical,
  CircleUser,
  ShieldCheck,
  PackageCheck,
  ListPlus,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/types/database";
import { SignOutButton } from "@/components/sign-out-button";

type NavEntry = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Highlight only on this exact path (used for /admin, which prefixes the other admin pages). */
  exact?: boolean;
};

// Each role's own day-to-day screen. Admins see all of them.
const WORKSPACES: Record<Exclude<Role, "admin">, NavEntry> = {
  tester: {
    href: "/tester",
    label: "Test & label",
    description: "Log a tested camera and print its QR label",
    icon: FlaskConical,
  },
  dispatcher: {
    href: "/dispatcher",
    label: "Pick & dispatch",
    description: "Scan a camera to look it up or pick it",
    icon: PackageCheck,
  },
  checker: {
    href: "/checker",
    label: "Stock count",
    description: "Scan the shelf and compare with the system",
    icon: ClipboardCheck,
  },
  data_entry: {
    href: "/data-entry",
    label: "Data entry",
    description: "Add brands, models and ASINs for testers to pick",
    icon: ListPlus,
  },
};

// The workspaces an admin sees in the "Workspaces" group — every role's own screen.
const ADMIN_WORKSPACE_KEYS = ["tester", "dispatcher", "checker", "data_entry"] as const;

const ADMIN_PAGES: NavEntry[] = [
  { href: "/admin/inventory", label: "Inventory", description: "See what is in stock right now", icon: Warehouse },
  { href: "/admin", exact: true, label: "Staff", description: "Invite people and manage roles", icon: Users },
  { href: "/admin/catalog", label: "Catalog", description: "Fix brands, models and colours", icon: BookOpen },
  { href: "/admin/export", label: "Export", description: "Download reports as CSV files", icon: FileDown },
];

// Where the "Admin" tab lands.
const ADMIN_HOME = ADMIN_PAGES[0].href;

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator",
  tester: "Tester",
  dispatcher: "Dispatcher",
  checker: "Checker",
  data_entry: "Data entry",
};

function isActive(entry: NavEntry, pathname: string) {
  return entry.exact ? pathname === entry.href : pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}

function buildNav(role: Role | null) {
  const workspaces =
    role === "admin" ? ADMIN_WORKSPACE_KEYS.map((key) => WORKSPACES[key]) : role ? [WORKSPACES[role]] : [];
  const groups: { heading: string; entries: NavEntry[] }[] = [];
  if (workspaces.length) {
    groups.push({ heading: role === "admin" ? "Workspaces" : "Your workspace", entries: workspaces });
  }
  if (role === "admin") groups.push({ heading: "Administration", entries: ADMIN_PAGES });
  return groups;
}

// The name is fetched in the browser, not passed down from the server layout:
// the service worker caches the /tester and /dispatcher page HTML for offline
// use on shared devices, and that HTML must never contain a person's name.
function useFullName() {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;
        const { data } = await supabase.from("profiles").select("full_name").eq("id", session.user.id).single();
        if (!cancelled) setName(data?.full_name ?? null);
      } catch {
        // Offline or blocked — the account card just falls back to the role.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return name;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

function NavItem({
  entry,
  active,
  layoutId,
}: {
  entry: NavEntry;
  active: boolean;
  layoutId: string;
}) {
  const Icon = entry.icon;
  return (
    <Link
      href={entry.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-2xl px-2.5 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60",
        active ? "text-fg" : "text-fg-muted hover:bg-glass-hover hover:text-fg"
      )}
    >
      {/* Active = a white card that visibly pops off the row, not a tinted/
          bordered box — inactive rows carry no surface at all, matching
          design reference d2.webp's nav rail (flat glyph vs. a raised white
          tile for the selected one). */}
      {active && (
        <motion.span
          layoutId={layoutId}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="glass absolute inset-0 rounded-2xl"
        />
      )}
      <span
        className={cn(
          "relative flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
          active ? "glass-strong text-fg" : "text-fg-muted group-hover:text-fg"
        )}
      >
        <Icon aria-hidden="true" className="size-[18px]" />
      </span>
      <span className="relative min-w-0">
        <span className="block truncate text-sm font-semibold leading-tight">{entry.label}</span>
        <span className="mt-0.5 block text-xs leading-snug text-fg-subtle">{entry.description}</span>
      </span>
    </Link>
  );
}

function SidebarContent({
  idPrefix,
  role,
  fullName,
  pathname,
}: {
  idPrefix: string;
  role: Role | null;
  fullName: string | null;
  pathname: string;
}) {
  const groups = buildNav(role);

  return (
    <>
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full shadow-lg shadow-accent-strong/30"
          style={{
            background: "radial-gradient(circle at 32% 28%, var(--accent-strong), var(--accent) 55%, #2d2a8f 100%)",
          }}
        >
          <Aperture aria-hidden="true" className="size-5 text-white" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-fg">Pixel Direct</p>
          <p className="text-xs text-fg-subtle">Camera inventory</p>
        </div>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {groups.map((group) => (
          <div key={group.heading}>
            <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-fg-subtle uppercase">
              {group.heading}
            </p>
            <div className="space-y-1">
              {group.entries.map((entry) => (
                <NavItem
                  key={entry.href}
                  entry={entry}
                  active={isActive(entry, pathname)}
                  layoutId={`${idPrefix}-active`}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-line-soft p-3">
        {role && (
          <div className="flex items-center gap-3 rounded-2xl border border-line-soft bg-glass-soft px-3 py-2.5">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white"
            >
              {fullName ? initials(fullName) : ROLE_LABEL[role][0]}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{fullName ?? ROLE_LABEL[role]}</p>
              <p className="truncate text-xs text-fg-subtle">{fullName ? ROLE_LABEL[role] : "Signed in"}</p>
            </div>
          </div>
        )}
        <SignOutButton className="w-full" />
      </div>
    </>
  );
}


type MobileTab = { href: string; label: string; icon: LucideIcon; match: (pathname: string) => boolean };

// iOS-style tab bar: one tab per workspace (admins also get "Admin"), plus an
// Account tab that opens a sheet. Short labels so five tabs fit a phone.
const MOBILE_LABEL: Record<Exclude<Role, "admin">, string> = {
  tester: "Test",
  dispatcher: "Dispatch",
  checker: "Count",
  data_entry: "Entry",
};

function buildTabs(role: Role | null): MobileTab[] {
  const workspaceKeys: Exclude<Role, "admin">[] = role === "admin" ? [...ADMIN_WORKSPACE_KEYS] : role ? [role] : [];
  const tabs: MobileTab[] = workspaceKeys.map((key) => ({
    href: WORKSPACES[key].href,
    label: MOBILE_LABEL[key],
    icon: WORKSPACES[key].icon,
    match: (pathname) => isActive(WORKSPACES[key], pathname),
  }));
  if (role === "admin") {
    tabs.push({ href: ADMIN_HOME, label: "Admin", icon: ShieldCheck, match: (p) => p.startsWith("/admin") });
  }
  return tabs;
}

function AccountPanel({ role, fullName }: { role: Role | null; fullName: string | null }) {
  return (
    <div className="space-y-3">
      {role && (
        <div className="flex items-center gap-3 rounded-2xl border border-line-soft bg-glass-soft px-3 py-3">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white"
          >
            {fullName ? initials(fullName) : ROLE_LABEL[role][0]}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{fullName ?? ROLE_LABEL[role]}</p>
            <p className="truncate text-xs text-fg-subtle">{fullName ? ROLE_LABEL[role] : "Signed in"}</p>
          </div>
        </div>
      )}
      <SignOutButton className="w-full" />
    </div>
  );
}

function MobileTabBar({ role, fullName, pathname }: { role: Role | null; fullName: string | null; pathname: string }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const tabs = buildTabs(role);

  const itemClass = (active: boolean) =>
    cn(
      "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60",
      active ? "text-success" : "text-fg-subtle active:text-fg"
    );

  const inner = (Icon: LucideIcon, label: string, active: boolean) => (
    <>
      {/* Active = a card that pops off the bar, not a coloured/bordered box —
          matches the sidebar's NavItem treatment and design.png / d2.webp's
          "flat glyph vs. raised white tile" nav. Pure white against the
          bar's own light grey, not the same near-white gradient as the bar. */}
      {active && (
        <motion.span
          layoutId="tabbar-active"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="absolute inset-0 rounded-2xl bg-white shadow-(--shadow-raised)"
        />
      )}
      <Icon aria-hidden="true" className="relative size-[22px]" />
      <span className="relative max-w-full truncate">{label}</span>
    </>
  );

  return (
    <nav
      aria-label="Main"
      // A faint grey bar, not the same near-white panel as everything else —
      // that's what makes the active tab's pure-white pill actually pop.
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex items-stretch gap-1 rounded-3xl bg-[#e7e9f0] p-1.5 shadow-(--shadow-raised) print:hidden sm:hidden"
    >
      {tabs.map(({ href, label, icon, match }) => {
        const active = match(pathname);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
            {inner(icon, label, active)}
          </Link>
        );
      })}

      <Dialog.Root open={accountOpen} onOpenChange={setAccountOpen}>
        <Dialog.Trigger asChild>
          <button type="button" className={itemClass(accountOpen)}>
            {inner(CircleUser, "Account", accountOpen)}
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
          <Dialog.Content
            aria-describedby={undefined}
            className="glass-strong fixed inset-x-0 bottom-0 z-50 rounded-b-none rounded-t-3xl border-b-0 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom"
          >
            <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line" />
            <VisuallyHidden.Root>
              <Dialog.Title>Account</Dialog.Title>
            </VisuallyHidden.Root>
            <AccountPanel role={role} fullName={fullName} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </nav>
  );
}

// Mobile-only section switcher for the admin area: a pill showing the current
// section that drops down the full admin menu.
function AdminMenu({ pathname }: { pathname: string }) {
  const current = ADMIN_PAGES.find((page) => isActive(page, pathname)) ?? ADMIN_PAGES[0];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Admin section: ${current.label}. Change section`}
          className="group mx-auto flex max-w-full items-center gap-2 rounded-full border border-line bg-glass-soft py-1 pr-2.5 pl-1 text-sm font-semibold text-fg outline-none transition-colors hover:bg-glass-hover focus-visible:ring-2 focus-visible:ring-accent/60 data-[state=open]:bg-glass-hover"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-white">
            <CurrentIcon aria-hidden="true" className="size-4" />
          </span>
          <span className="truncate">
            <span className="font-normal text-fg-subtle">Admin · </span>
            {current.label}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-fg-subtle transition-transform group-data-[state=open]:rotate-180"
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="center"
          sideOffset={8}
          collisionPadding={12}
          className="glass-strong z-50 w-(--radix-dropdown-menu-trigger-width) min-w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl p-1.5 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-top-2"
        >
          {ADMIN_PAGES.map((page) => {
            const active = isActive(page, pathname);
            return (
              <DropdownMenu.Item key={page.href} asChild>
                <Link
                  href={page.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-2.5 py-2.5 outline-none transition-colors data-[highlighted]:bg-glass-hover",
                    active && "bg-glass-soft"
                  )}
                >
                  {/* Already inside a white glass-strong popover, so the
                      active state here is "pressed in" rather than another
                      white-on-white card — the checkmark below is the other
                      half of the signal. */}
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-xl text-fg-muted transition-colors",
                      active && "well text-fg"
                    )}
                  >
                    <page.icon aria-hidden="true" className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold leading-tight text-fg">{page.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-fg-subtle">{page.description}</span>
                  </span>
                  {active && <Check aria-hidden="true" className="size-4 shrink-0 text-accent" />}
                </Link>
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function currentPageLabel(role: Role | null, pathname: string) {
  const entries = buildNav(role).flatMap((g) => g.entries);
  return entries.find((e) => isActive(e, pathname))?.label ?? "Pixel Direct";
}

export function AppShell({ role, children }: { role: Role | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const fullName = useFullName();
  const inAdmin = role === "admin" && pathname.startsWith("/admin");

  return (
    <div className="min-h-dvh print:min-h-0 sm:flex">
      {/* Mobile header — page title (and admin section chips); navigation lives in the bottom tab bar. */}
      <header className="glass sticky top-0 z-20 rounded-none border-x-0 border-t-0 px-4 py-2.5 print:hidden sm:hidden">
        {inAdmin ? (
          <AdminMenu pathname={pathname} />
        ) : (
          <div className="flex min-h-9 items-center justify-center gap-2">
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-full"
              style={{
                background: "radial-gradient(circle at 32% 28%, var(--accent-strong), var(--accent) 55%, #2d2a8f 100%)",
              }}
            >
              <Aperture aria-hidden="true" className="size-3.5 text-white" />
            </span>
            <p className="truncate text-sm font-semibold text-fg">{currentPageLabel(role, pathname)}</p>
          </div>
        )}
      </header>

      {/* Desktop sidebar */}
      <aside className="glass sticky top-0 hidden h-dvh w-72 shrink-0 flex-col rounded-none border-y-0 border-l-0 print:hidden sm:flex">
        <SidebarContent idPrefix="desktop" role={role} fullName={fullName} pathname={pathname} />
      </aside>

      <main className="min-w-0 flex-1 px-4 pt-5 pb-28 print:m-0 print:block print:p-0 sm:px-8 sm:py-8 lg:flex lg:flex-col">{children}</main>

      <MobileTabBar role={role} fullName={fullName} pathname={pathname} />
    </div>
  );
}
