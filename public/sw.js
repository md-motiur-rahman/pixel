// Minimal offline-support service worker. This app runs on shared warehouse
// devices, so it deliberately caches ONLY static assets and the /offline
// fallback — never a navigation/RSC response or an /api/* response, since
// those carry per-user or business data (inventory, exports, admin pages)
// that must not be replayed to whoever uses the device next while offline.
const CACHE_NAME = "pixel-inventory-v2";
const PRECACHE_URLS = ["/offline"];

function isCacheable(url) {
  return (
    url.pathname === "/offline" ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/favicon.ico" ||
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:png|jpg|jpeg|svg|ico|webmanifest|woff2?)$/.test(url.pathname)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isCacheable(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Anything else (pages, RSC payloads, /api/*) is never cached. A failed
  // navigation falls back to the static /offline page; everything else is
  // left alone so the app's own offline-queue handling (see the scan/pick
  // flows) sees the real network failure and reacts to it.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
  }
});
