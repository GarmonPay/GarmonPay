"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { BannerRotator } from "@/components/banners/BannerRotator";

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div
      className="relative min-h-[100dvh] overflow-x-hidden"
      style={{
        background: "linear-gradient(180deg, #020617 0%, #0f172a 40%, #020617 100%)",
      }}
    >
      {/* Top app header: Logo, Notification, Menu */}
      <header
        className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-white/[0.08] px-4"
        style={{
          background: "rgba(2, 6, 23, 0.95)",
          paddingTop: "env(safe-area-inset-top, 0)",
          minHeight: "56px",
        }}
      >
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10 active:scale-95"
          aria-label="Menu"
        >
          <span className="text-xl" aria-hidden>☰</span>
        </button>
        <Link
          href="/dashboard"
          className="text-lg font-bold tracking-tight text-white"
        >
          GarmonPay
        </Link>
        <Link
          href="/dashboard/notifications"
          className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10 active:scale-95"
          aria-label="Notifications"
        >
          <span className="text-xl" aria-hidden>🔔</span>
        </Link>
      </header>

      {/* Sidebar drawer: hidden until menu clicked */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60"
            aria-hidden
            onClick={() => setSidebarOpen(false)}
          />
          <aside
            className="fixed top-0 left-0 z-50 h-full w-64 border-r border-white/10 bg-[#0f172a] shadow-xl"
            style={{ paddingTop: "env(safe-area-inset-top, 0)" }}
          >
            <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
              <span className="font-semibold text-white">Menu</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg text-white/70 hover:bg-white/10"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto py-4">
              <Sidebar onNavigate={() => setSidebarOpen(false)} />
            </div>
          </aside>
        </>
      )}

      {/* App container: max-width 430px, centered, banking-app style */}
      <main
        className="mx-auto w-full max-w-[430px] pt-14 pb-[65px]"
        style={{
          minHeight: "100dvh",
          paddingBottom: "calc(65px + env(safe-area-inset-bottom, 0))",
        }}
      >
        <div className="px-4 py-4">
          <div className="mb-4">
            <BannerRotator placement="dashboard-top" />
          </div>
          <div className="dashboard-main flex flex-col gap-4">{children}</div>
        </div>
      </main>
    </div>
  );
}
