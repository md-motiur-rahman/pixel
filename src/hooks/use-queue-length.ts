"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { createOfflineQueue, QueueItem } from "@/lib/offline-queue";

function useQueueSubscribe(storageKey: string) {
  return useCallback(
    (callback: () => void) => {
      const eventName = `offline-queue:${storageKey}`;
      window.addEventListener(eventName, callback);
      window.addEventListener("storage", callback);
      return () => {
        window.removeEventListener(eventName, callback);
        window.removeEventListener("storage", callback);
      };
    },
    [storageKey]
  );
}

// Reactively tracks an offline queue's length — including changes made by
// this same tab (enqueue/flush), which the native "storage" event misses.
export function useQueueLength<T>(
  queue: ReturnType<typeof createOfflineQueue<T>>,
  storageKey: string
) {
  const subscribe = useQueueSubscribe(storageKey);
  return useSyncExternalStore(
    subscribe,
    () => queue.list().length,
    () => 0
  );
}

// Same idea, but for a filtered count (e.g. only items for the active session).
export function useFilteredQueueCount<T>(
  queue: ReturnType<typeof createOfflineQueue<T>>,
  storageKey: string,
  predicate: (item: QueueItem<T>) => boolean
) {
  const subscribe = useQueueSubscribe(storageKey);
  return useSyncExternalStore(
    subscribe,
    () => queue.list().filter(predicate).length,
    () => 0
  );
}
