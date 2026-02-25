"use client";

import { DashboardHeader } from "@/components/DashboardHeader";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { BannerRotator } from "@/components/banners/BannerRotator";

export function DesktopLayout({ children }: { children: React.ReactNode }) {

  return (
    <div className="min-h-screen bg-fintech-bg">
      <div className="border-b border-white/[0.06] shadow-soft">
        <DashboardHeader />
      </div>
      <div className="mx-auto flex max-w-7xl">
        <aside className="hidden tablet:block w-56 shrink-0 border-r border-white/[0.06] bg-fintech-bg-card/50 py-4 px-3" aria-label="Dashboard navigation">
          <Sidebar onNavigate={() => {}} />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6">
          <div className="mx-auto max-w-2xl mb-6">
            <BannerRotator placement="dashboard-top" />
          </div>
          <div className="dashboard-main animate-fade-in flex flex-col gap-4">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
