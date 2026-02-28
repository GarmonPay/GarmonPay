"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAdminSessionAsync, type AdminSession } from "@/lib/admin-supabase";
import { AdminSidebar } from "@/components/AdminSidebar";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
  const [session, setSession] = useState<AdminSession | null | "loading">("loading");

  useEffect(() => {
    getAdminSessionAsync().then((s) => {
      setSession(s ?? null);
      if (!s) router.replace("/admin/login");
    });
  }, [router]);

  if (session === "loading" || !session) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {!session && session !== "loading" ? "Redirecting to login…" : "Loading…"}
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
