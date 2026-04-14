/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope;

// Basic service worker for PWA (mirrored in public/sw.js for /sw.js registration)
sw.addEventListener("install", () => {
  console.log("GarmonPay SW installed");
});

sw.addEventListener("fetch", () => {
  // Network first strategy
});

sw.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data?.type === "SKIP_WAITING") sw.skipWaiting();
});
