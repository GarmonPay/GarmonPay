"use client";

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/dashboard/Sidebar";
import MobileNav from "@/components/mobile-nav";
import { BannerRotator } from "@/components/banners/BannerRotator";
import { getSessionAsync } from "@/lib/session";
import { attachReferralByReferrerIdSession } from "@/lib/api";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { MembershipWelcomeBanner } from "@/components/dashboard/MembershipWelcomeBanner";

const REF_STORAGE_KEY = "garmonpay_ref";
const REFERRAL_NOTICE_SESSION_KEY = "garmonpay_referral_notice";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [referralNotice, setReferralNotice] = useState<string | null>(null);
  const topStackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = topStackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const apply = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty(
        "--dashboard-top-stack-height",
        `${h}px`,
      );
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--dashboard-top-stack-height");
    };
  }, [referralNotice]);

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
        {/* Viewport-locked: not inside overflow/transform wrappers; height drives main offset */}
        <div
          ref={topStackRef}
          className="fixed top-0 left-0 right-0 z-[9999] flex w-full flex-col pt-[env(safe-area-inset-top,0px)]"
        >
          {referralNotice ? (
            <div
              className="flex w-full shrink-0 justify-center px-3 py-2"
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
          <DashboardHeader />
        </div>

        <div
          className="flex max-h-none min-h-[100dvh] min-w-0 w-full max-w-full overflow-x-hidden bg-[#0e0118] pt-[var(--dashboard-top-stack-height,4rem)]"
          style={{ minHeight: "100vh" }}
        >
          <aside
            className="hidden h-full min-h-0 shrink-0 tablet:flex tablet:flex-col"
            aria-label="Dashboard navigation"
          >
            <Sidebar onNavigate={() => {}} />
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom,0px))] tablet:pb-0">
            <main className="min-w-0 flex-1 px-4 py-4 text-[14px] max-w-full leading-normal tablet:px-6 tablet:py-6 tablet:text-base">
              <div className="mx-auto mb-4 max-w-2xl tablet:mb-6">
                <BannerRotator placement="dashboard-top" />
              </div>
              <div className="mx-auto w-full max-w-2xl">
                <MembershipWelcomeBanner />
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
