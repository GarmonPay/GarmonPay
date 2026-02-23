"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdminSession } from "@/lib/admin-session";
import { AdminSidebar } from "@/components/AdminSidebar";

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace("/admin/login");
      setOk(false);
    } else {
      setOk(true);
    }
  }, [router]);

  if (ok === null || ok === false) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {ok === false ? "Redirecting to admin login…" : "Loading…"}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e17", display: "flex" }}>
      <AdminSidebar />
      <main style={{ flex: 1, overflow: "auto" }}>{children}</main>
    </div>
  );
}
