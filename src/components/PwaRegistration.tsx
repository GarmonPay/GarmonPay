"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
          reg.addEventListener("updatefound", () => {
            const worker = reg.installing;
            if (!worker) return;
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                worker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
        })
        .catch(() => {});
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }, []);
  return null;
}
