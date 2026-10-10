"use client";

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-warn-line bg-warn-soft px-4 py-2 text-center text-sm font-medium text-warn print:hidden"
    >
      <WifiOff aria-hidden="true" className="size-4 shrink-0" />
      <span>
        You&rsquo;re offline. Lookups need a connection, but picks and scans will be queued and
        synced automatically once you&rsquo;re back online.
      </span>
    </div>
  );
}
