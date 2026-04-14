// Basic service worker for PWA (keep in sync with src/app/service-worker.ts)
self.addEventListener("install", () => {
  console.log("GarmonPay SW installed");
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", () => {
  // Network first strategy
});
