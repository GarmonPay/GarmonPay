"use client";

import { AdminSidebar } from "@/components/AdminSidebar";

export function AdminDashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#0a0e17]">
      <AdminSidebar />
      <main className="flex-1 overflow-auto min-h-screen flex flex-col px-4 md:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
