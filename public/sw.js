const CACHE_NAME = "garmonpay-v3-static";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method !== "GET") return;
  const path = url.pathname;
  // Do NOT cache the homepage — it must always be fetched fresh from the server
  // so the full landing page is always served (never a stale cached splash).
  if (path === "/") return;
  const isStatic =
    path === "/manifest.json" ||
    path.startsWith("/icon-") ||
    path.startsWith("/_next/static/") ||
    path.endsWith(".js") ||
    path.endsWith(".css") ||
    path.endsWith(".png") ||
    path.endsWith(".ico");
  if (!isStatic) return;
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok && res.type === "basic") cache.put(request, res.clone());
          return res;
        });
      })
    )
  );
});
