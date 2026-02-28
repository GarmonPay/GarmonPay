"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdminSessionAsync } from "@/lib/admin-supabase";

export default function SuperAdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then((session) => {
      if (!session?.isSuperAdmin) {
        router.replace("/dashboard");
        setAllowed(false);
      } else {
        setAllowed(true);
      }
    });
  }, [router]);

  if (allowed === null || allowed === false) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {allowed === false ? "Redirecting…" : "Loading…"}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#f9fafb", padding: "2rem" }}>
      <h1 className="text-2xl font-bold text-white">Super Admin</h1>
      <p className="text-fintech-muted mt-2">Full access. This area is only visible to super admins.</p>
    </div>
  );
}
