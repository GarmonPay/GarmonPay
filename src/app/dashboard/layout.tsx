"use client";

import { Suspense, useEffect } from "react";
import { MobileLayout } from "@/components/mobile-layout";
import { DesktopLayout } from "@/components/desktop-layout";
import MobileNav from "@/components/mobile-nav";
import { getSessionAsync } from "@/lib/session";
import { attachReferralByReferrerIdSession } from "@/lib/api";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

const REF_STORAGE_KEY = "garmonpay_ref";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const ref =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(REF_STORAGE_KEY)
        : null;
    if (!ref) return;
    getSessionAsync().then((session) => {
      if (!session) return;
      const tokenOrId = session.accessToken ?? session.userId;
      const isToken = !!session.accessToken;
      attachReferralByReferrerIdSession(tokenOrId, isToken, ref)
        .then(() => {
          if (typeof localStorage !== "undefined")
            localStorage.removeItem(REF_STORAGE_KEY);
        })
        .catch(() => {});
    });
  }, []);

  return (
    <AppErrorBoundary>
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-[#0a0e17] text-[#9ca3af]">
            Loading…
          </div>
        }
      >
        {/* Mobile: default under 768px; bottom nav, no sidebar */}
        <div className="block tablet:hidden">
          <MobileLayout>{children}</MobileLayout>
        </div>
        {/* Desktop: 768px and up — sidebar + main */}
        <div className="hidden tablet:block">
          <DesktopLayout>{children}</DesktopLayout>
        </div>
        <MobileNav />
      </Suspense>
    </AppErrorBoundary>
  );
}
