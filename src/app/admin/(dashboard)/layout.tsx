"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdminSessionAsync } from "@/lib/admin-supabase";
import { AdminDashboardShell } from "./AdminDashboardShell";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;
    getAdminSessionAsync()
      .then((session) => {
        if (!mounted) return;
        if (!session) {
          setAllowed(false);
          setChecking(false);
          router.replace("/admin/login");
          return;
        }
        setAllowed(true);
        setChecking(false);
      })
      .catch(() => {
        if (!mounted) return;
        setAllowed(false);
        setChecking(false);
        router.replace("/admin/login");
      });
    return () => {
      mounted = false;
    };
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#9ca3af]">
        Checking admin session…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#9ca3af]">
        Redirecting to admin login…
      </div>
    );
  }

  return <AdminDashboardShell>{children}</AdminDashboardShell>;
}
