"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: { sitekey: string; callback?: (token: string) => void }) => string;
      remove?: (widgetId: string) => void;
    };
  }
}

export function TurnstileWidget({
  siteKey,
  onVerify,
  onExpire,
}: {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!loaded || !siteKey || !containerRef.current) return;
    const el = containerRef.current;
    if (!window.turnstile) return;
    try {
      widgetIdRef.current = window.turnstile.render(el, {
        sitekey: siteKey,
        callback: (token) => onVerify(token),
      });
    } catch (e) {
      console.error("Turnstile render error:", e);
    }
    return () => {
      if (widgetIdRef.current && window.turnstile?.remove) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [loaded, siteKey, onVerify]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src={TURNSTILE_SCRIPT}
        strategy="afterInteractive"
        onLoad={() => setLoaded(true)}
      />
      <div ref={containerRef} className="flex justify-center my-3 min-h-[65px]" />
    </>
  );
}
