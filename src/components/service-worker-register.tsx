"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline caching is a nice-to-have — if registration fails, the app
        // still works fine online.
      });
    }
  }, []);

  return null;
}
