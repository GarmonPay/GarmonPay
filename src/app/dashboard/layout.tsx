"use client";

import { useEffect } from "react";
import { MobileLayout } from "@/components/mobile-layout";
import { DesktopLayout } from "@/components/desktop-layout";
import MobileNav from "@/components/mobile-nav";
import { getSessionAsync } from "@/lib/session";
import { attachReferralByReferrerIdSession } from "@/lib/api";

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
    <>
      {/* Mobile: show only on small screens; no sidebar rendered here */}
      <div className="block md:hidden">
        <MobileLayout>{children}</MobileLayout>
      </div>
      {/* Desktop: sidebar + main */}
      <div className="hidden md:block">
        <DesktopLayout>{children}</DesktopLayout>
      </div>
      <MobileNav />
    </>
  );
}
