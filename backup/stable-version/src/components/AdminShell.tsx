"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { getAdminSession } from "@/lib/admin-session";
import { AdminSidebar } from "@/components/AdminSidebar";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/admin/login";

  if (isLogin) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0e17" }}>
        {children}
      </div>
    );
  }

  return <ProtectedAdminShell>{children}</ProtectedAdminShell>;
}

function ProtectedAdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const session = getAdminSession();
    if (!session) {
      router.replace("/admin/login");
    }
  }, [router]);

  if (typeof window === "undefined") {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center" }}>
        Loading…
      </div>
    );
  }

  const session = getAdminSession();
  if (!session) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center" }}>
        Redirecting to admin login…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e17", display: "flex" }} className="min-h-screen bg-[#0a0e17] flex">
      <AdminSidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
