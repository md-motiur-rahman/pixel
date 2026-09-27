"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="sticky top-0 z-20 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white">
      You&rsquo;re offline. Lookups need a connection, but picks and scans will be queued and
      synced automatically once you&rsquo;re back online.
    </div>
  );
}
