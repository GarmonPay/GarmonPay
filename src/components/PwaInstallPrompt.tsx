"use client";

import { useEffect, useState } from "react";

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<{ prompt: () => Promise<{ outcome: string }> } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as { standalone?: boolean }).standalone === true
      || document.referrer.includes("android-app://");
    if (isStandalone) {
      setInstalled(true);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      const ev = e as unknown as { prompt: () => Promise<{ outcome: string }> };
      setDeferredPrompt({ prompt: () => ev.prompt() });
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      const { outcome } = await deferredPrompt.prompt();
      if (outcome === "accepted") setInstalled(true);
      setDeferredPrompt(null);
      setDismissed(true);
    } catch {
      setDeferredPrompt(null);
      setDismissed(true);
    }
  };

  const show = deferredPrompt && !dismissed && !installed;
  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 rounded-xl bg-[#111827] border border-white/20 shadow-lg p-4 flex items-center justify-between gap-3">
      <p className="text-sm text-white">Install GarmonPay on your device for a better experience.</p>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={handleInstall}
          className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium text-sm"
        >
          Install
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="px-3 py-2 rounded-lg border border-white/20 text-[#9ca3af] hover:bg-white/5 text-sm"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
