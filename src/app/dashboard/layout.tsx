"use client";

import { Suspense, useEffect, useState } from "react";
import { MobileLayout } from "@/components/mobile-layout";
import { DesktopLayout } from "@/components/desktop-layout";
import MobileNav from "@/components/mobile-nav";
import { getSessionAsync } from "@/lib/session";
import { attachReferralByReferrerIdSession } from "@/lib/api";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

const REF_STORAGE_KEY = "garmonpay_ref";
const REFERRAL_NOTICE_SESSION_KEY = "garmonpay_referral_notice";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [referralNotice, setReferralNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      const n = sessionStorage.getItem(REFERRAL_NOTICE_SESSION_KEY);
      if (n) {
        sessionStorage.removeItem(REFERRAL_NOTICE_SESSION_KEY);
        setReferralNotice(n);
      }
    } catch {
      // ignore
    }
  }, []);

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
        {referralNotice ? (
          <div
            className="fixed left-0 right-0 top-0 z-[100] flex justify-center px-3 py-2"
            style={{
              background: "rgba(180, 83, 9, 0.25)",
              borderBottom: "1px solid rgba(251, 191, 36, 0.35)",
              color: "#fde68a",
            }}
            role="status"
          >
            <p className="max-w-2xl text-center text-xs sm:text-sm">{referralNotice}</p>
            <button
              type="button"
              className="ml-3 shrink-0 text-amber-200/90 underline"
              onClick={() => setReferralNotice(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}
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
