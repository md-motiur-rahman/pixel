export type QueueItem<T> = { id: string; payload: T; createdAt: number };

type StoredQueue<T> = { version: number; items: QueueItem<T>[] };

// A minimal localStorage-backed FIFO queue. Used to hold write actions (a
// checker's scan, a dispatcher's pick) that couldn't reach the server because
// the connection dropped, so they can be retried once it's back.
export function createOfflineQueue<T>(storageKey: string) {
  function readStored(): StoredQueue<T> {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return { version: 0, items: [] };
      const parsed = JSON.parse(raw);
      // Tolerate the pre-versioned format (a bare array) from before this fix.
      if (Array.isArray(parsed)) return { version: 0, items: parsed as QueueItem<T>[] };
      return { version: parsed.version ?? 0, items: parsed.items ?? [] };
    } catch {
      return { version: 0, items: [] };
    }
  }

  function notify() {
    window.dispatchEvent(new Event(`offline-queue:${storageKey}`));
  }

  // Optimistic concurrency, not a true lock: read, compute the new items,
  // write, then verify nobody else wrote in between (narrowed to the gap
  // between our own setItem and getItem) — if they did, retry against the
  // latest state instead of silently clobbering it. This is what keeps two
  // tabs on the same shared device from losing each other's queued pick or
  // scan when both write around the same moment.
  function mutate(updater: (items: QueueItem<T>[]) => QueueItem<T>[]): { ok: boolean; items: QueueItem<T>[] } {
    let current = readStored();
    for (let attempt = 0; attempt < 5; attempt++) {
      const nextItems = updater(current.items);
      const nextVersion = current.version + 1;
      try {
        localStorage.setItem(storageKey, JSON.stringify({ version: nextVersion, items: nextItems }));
      } catch {
        // Storage unavailable or full — nothing more we can do here.
        return { ok: false, items: current.items };
      }
      const after = readStored();
      if (after.version === nextVersion) {
        notify();
        return { ok: true, items: nextItems };
      }
      current = after; // another tab wrote in between — retry against its state
    }
    return { ok: false, items: current.items };
  }

  return {
    list(): QueueItem<T>[] {
      return readStored().items;
    },
    // Reports whether the item is actually persisted — a caller that ignores
    // this and shows "queued, will sync later" regardless can end up telling
    // someone their pick/scan is safe when it was silently lost (storage
    // full, disabled, or blocked by the browser).
    enqueue(payload: T): { ok: boolean; item: QueueItem<T> } {
      const item: QueueItem<T> = { id: crypto.randomUUID(), payload, createdAt: Date.now() };
      const { ok } = mutate((items) => [...items, item]);
      return { ok, item };
    },
    removeItem(id: string) {
      mutate((items) => items.filter((item) => item.id !== id));
    },
  };
}
