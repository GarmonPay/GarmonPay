"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdminSessionAsync } from "@/lib/admin-supabase";
import { createBrowserClient } from "@/lib/supabase";
import { AdminSidebar } from "@/components/AdminSidebar";

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "allowed" | "forbidden">("loading");

  useEffect(() => {
    const supabase = createBrowserClient();
    if (!supabase) {
      router.replace("/admin/login");
      return;
    }
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace("/admin/login");
        setStatus("forbidden");
        return;
      }
      const adminSession = await getAdminSessionAsync();
      if (!adminSession) {
        router.replace("/admin/login");
        setStatus("forbidden");
        return;
      }
      setStatus("allowed");
    };
    check();
  }, [router]);

  if (status === "loading" || status === "forbidden") {
    return (
      <div className="min-h-screen bg-[#0a0e17] text-[#9ca3af] flex items-center justify-center">
        {status === "forbidden" ? "Redirecting to login…" : "Loading…"}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#0a0e17]">
      <AdminSidebar />
      <main className="flex-1 overflow-auto min-h-screen flex flex-col">
        {children}
      </main>
    </div>
  );
}
