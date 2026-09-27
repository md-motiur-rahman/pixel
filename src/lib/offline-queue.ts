export type QueueItem<T> = { id: string; payload: T; createdAt: number };

// A minimal localStorage-backed FIFO queue. Used to hold write actions (a
// checker's scan, a dispatcher's pick) that couldn't reach the server because
// the connection dropped, so they can be retried once it's back.
export function createOfflineQueue<T>(storageKey: string) {
  function read(): QueueItem<T>[] {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as QueueItem<T>[]) : [];
    } catch {
      return [];
    }
  }

  function write(items: QueueItem<T>[]) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // Best-effort persistence only — if storage is unavailable, the queue
      // just won't survive a reload, but the current tab keeps working.
    }
    // Same-tab listeners (see useQueueLength) don't get the native "storage"
    // event, which only fires in *other* tabs — so notify this tab directly.
    window.dispatchEvent(new Event(`offline-queue:${storageKey}`));
  }

  return {
    list: read,
    enqueue(payload: T): QueueItem<T> {
      const item: QueueItem<T> = { id: crypto.randomUUID(), payload, createdAt: Date.now() };
      write([...read(), item]);
      return item;
    },
    removeItem(id: string) {
      write(read().filter((item) => item.id !== id));
    },
  };
}
