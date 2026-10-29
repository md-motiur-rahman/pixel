"use client";

import { useMemo, useState } from "react";
import { Search, ShieldCheck, UserCheck, UserPlus, Users, UserX } from "lucide-react";
import type { Role } from "@/types/database";
import { Button, Card, Input, Message, Select } from "@/components/ui";
import { ALL_ROLES, ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/cn";
import { InviteDialog } from "./invite-dialog";
import { StaffRow } from "./staff-row";
import type { StaffMember } from "./staff-ui";

type StatusFilter = "all" | "active" | "inactive";

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  tone: string;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-2xl", tone)}>
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold leading-none tabular-nums text-fg">{value}</p>
        <p className="mt-1 truncate text-xs text-fg-muted">{label}</p>
      </div>
    </Card>
  );
}

export function StaffScreen({ members, currentUserId }: { members: StaffMember[]; currentUserId: string | null }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  const stats = useMemo(
    () => ({
      total: members.length,
      active: members.filter((m) => m.isActive).length,
      inactive: members.filter((m) => !m.isActive).length,
      admins: members.filter((m) => m.roles.includes("admin")).length,
    }),
    [members]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (statusFilter === "active" && !m.isActive) return false;
      if (statusFilter === "inactive" && m.isActive) return false;
      if (roleFilter && !m.roles.includes(roleFilter)) return false;
      if (!q) return true;
      return `${m.fullName} ${m.email}`.toLowerCase().includes(q);
    });
  }, [members, query, roleFilter, statusFilter]);

  const filtering = Boolean(query.trim() || roleFilter || statusFilter !== "all");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Staff</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Invite people, choose what each of them can do, and manage their access.
          </p>
        </div>
        <Button type="button" onClick={() => setInviteOpen(true)}>
          <UserPlus aria-hidden="true" />
          Invite staff
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total staff" value={stats.total} icon={Users} tone="bg-accent/10 text-accent" />
        <StatTile label="Active" value={stats.active} icon={UserCheck} tone="bg-success-soft text-success" />
        <StatTile label="Deactivated" value={stats.inactive} icon={UserX} tone="bg-glass-hover text-fg-muted" />
        <StatTile label="Admins" value={stats.admins} icon={ShieldCheck} tone="bg-warn-soft text-warn" />
      </div>

      {notice && <Message variant={notice.tone}>{notice.message}</Message>}

      {/* Directory */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line-soft p-4 sm:flex-row sm:items-center sm:px-5">
          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              type="search"
              name="staff-search"
              autoComplete="off"
              aria-label="Search staff"
              placeholder="Search by name or email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-10 py-1.5 pl-9 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1 sm:w-40 sm:flex-none">
              <Select
                aria-label="Filter by role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as Role | "")}
                className="min-h-10 py-1.5 text-sm"
              >
                <option value="">All roles</option>
                {ALL_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1 sm:w-36 sm:flex-none">
              <Select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="min-h-10 py-1.5 text-sm"
              >
                <option value="all">Any status</option>
                <option value="active">Active</option>
                <option value="inactive">Deactivated</option>
              </Select>
            </div>
          </div>
        </div>

        {/* Column headings (large screens) */}
        <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,2fr)_7rem_7rem_2.5rem] gap-x-4 border-b border-line-soft bg-field px-5 py-2.5 text-xs font-medium uppercase tracking-wider text-fg-subtle lg:grid">
          <span>Member</span>
          <span>Roles</span>
          <span>Status</span>
          <span>Joined</span>
          <span className="sr-only">Actions</span>
        </div>

        <ul className="divide-y divide-line-soft">
          {shown.map((member) => (
            <StaffRow
              key={member.id}
              member={member}
              isYou={member.id === currentUserId}
              onNotify={(message, tone) => setNotice({ message, tone })}
            />
          ))}
        </ul>

        {shown.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-fg">{filtering ? "No one matches" : "No staff yet"}</p>
            <p className="mt-1 text-sm text-fg-muted">
              {filtering ? "Try a different search or filter." : "Invite your first team member to get started."}
            </p>
          </div>
        )}

        {shown.length > 0 && (
          <p className="border-t border-line-soft px-5 py-3 text-xs text-fg-subtle">
            Showing {shown.length} of {members.length}
          </p>
        )}
      </Card>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={(message) => setNotice({ message, tone: "success" })}
      />
    </div>
  );
}
