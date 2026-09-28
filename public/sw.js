// Offline-support service worker for shared warehouse devices. Two tiers of
// caching, deliberately kept separate:
//
// 1. Static assets (+ /offline) — always safe, cached unconditionally.
// 2. The /dispatcher and /tester page *shells* — cached ONLY as full-page
//    navigations, because their rendered HTML genuinely carries no per-user
//    or business data (they render an empty client-side scan form; the only
//    thing that varies by who loaded them is whether an admin nav bar shows,
//    which isn't sensitive). This is what lets a dispatcher/tester reload —
//    not just keep an already-open tab — while offline and still reach the
//    scan/pick controls that the app's own offline-queue system then handles.
//
// /checker is deliberately excluded: its initial render embeds the actual
// active count session and live tally data, which must not be cached and
// replayed to whoever uses the device next. /admin, /api/*, and everything
// else are never cached for the same reason.
const CACHE_NAME = "pixel-inventory-v4";
const PRECACHE_URLS = ["/offline"];
const CACHEABLE_SHELL_PATHS = new Set(["/dispatcher", "/tester"]);

function isStaticAsset(url) {
  return (
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

  if (isStaticAsset(url) || url.pathname === "/offline") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          // waitUntil, not a bare .then() — without it, the browser can
          // consider this fetch event "done" (and suspend the worker) as
          // soon as respondWith's own promise resolves, before the cache
          // write actually finishes.
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Only a real top-level navigation gets the shell treatment — a same-URL
  // RSC-payload fetch (client-side Link navigation) is a different response
  // shape and must never share this cache entry with the full-HTML version.
  if (request.mode === "navigate") {
    if (CACHEABLE_SHELL_PATHS.has(url.pathname)) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            // A tester hitting /dispatcher gets server-redirected to /tester
            // by middleware (role gating). Never cache that redirected
            // response under the "/dispatcher" key — it would later serve a
            // tester's page to whoever opens /dispatcher offline, regardless
            // of their own role.
            if (response.ok && !response.redirected) {
              const copy = response.clone();
              // Same reason as the static-asset branch above: keep the
              // worker alive until this write actually completes, or a
              // successful online visit can still leave nothing cached.
              event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
            }
            return response;
          })
          .catch(() => caches.match(request).then((cached) => cached || caches.match("/offline")))
      );
    } else {
      event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    }
  }
});
