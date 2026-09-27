"use client";

import { useCallback, useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnlineStatus() {
  // getServerSnapshot always returns true — the server has no way to know the
  // client's real connectivity, and this must match what the client renders
  // on its FIRST pass (before hydration) to avoid a mismatch. React then
  // re-renders with the real value right after, no error either way.
  return useSyncExternalStore(subscribe, () => navigator.onLine, useCallback(() => true, []));
}
