"use client";

import { useEffect, useState } from "react";
type InstallPrompt = { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPrompt | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { if (sessionStorage.getItem("gp-install-dismissed") === "1") setDismissed(true); } catch { /* Optional preference storage. */ }
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as { standalone?: boolean }).standalone === true
      || document.referrer.includes("android-app://");
    if (isStandalone) {
      setInstalled(true);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as unknown as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
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
    <aside aria-label="Install GarmonPay" className="gp-install-prompt">
      <p className="text-sm text-white">Install GarmonPay on your device for a better experience.</p>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={handleInstall}
          className="gp-button gp-button-gold"
        >
          Install
        </button>
        <button
          type="button"
          onClick={() => { setDismissed(true); try { sessionStorage.setItem("gp-install-dismissed", "1"); } catch { /* Optional preference storage. */ } }}
          className="gp-button"
        >
          Not now
        </button>
      </div>
    </aside>
  );
}
