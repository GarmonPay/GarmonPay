"use client";

import { Suspense, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/dashboard/Sidebar";
import MobileNav from "@/components/mobile-nav";
import { BannerRotator } from "@/components/banners/BannerRotator";
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
          <div className="flex min-h-screen items-center justify-center bg-[#0a0e17] text-[#9ca3af]">
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

        <div
          className="flex max-h-none min-h-[100dvh] max-w-[100vw] overflow-hidden bg-[#0e0118]"
          style={{ minHeight: "100vh" }}
        >
          <aside
            className="hidden h-full min-h-0 shrink-0 tablet:flex tablet:flex-col"
            aria-label="Dashboard navigation"
          >
            <Sidebar onNavigate={() => {}} />
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom,0px))] tablet:pb-0">
            <DashboardHeader />
            <main className="min-w-0 flex-1 px-4 py-4 text-[14px] max-w-full leading-normal tablet:px-6 tablet:py-6 tablet:text-base">
              <div className="mx-auto mb-4 max-w-2xl tablet:mb-6">
                <BannerRotator placement="dashboard-top" />
              </div>
              <div className="dashboard-main animate-fade-in flex min-w-0 flex-col gap-4">
                {children}
              </div>
            </main>
          </div>
        </div>

        <MobileNav />
      </Suspense>
    </AppErrorBoundary>
  );
}
