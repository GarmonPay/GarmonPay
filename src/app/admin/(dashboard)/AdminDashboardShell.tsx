"use client";

import { AdminSidebar } from "@/components/AdminSidebar";

export function AdminDashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-fintech-bg">
      <AdminSidebar />
      <main className="flex-1 overflow-auto min-h-screen flex flex-col px-4 tablet:px-6 py-6">
        {children}
      </main>
    </div>
  );
}
