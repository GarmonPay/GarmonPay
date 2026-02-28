"use client";

import { AdminSidebar } from "@/components/AdminSidebar";

export function AdminDashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-[#0a0e17]">
      <AdminSidebar />
      <main className="flex-1 overflow-auto min-h-screen flex flex-col">
        {children}
      </main>
    </div>
  );
}
