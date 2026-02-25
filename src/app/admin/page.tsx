"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/dashboard");
  }, [router]);
  return (
    <div className="min-h-screen bg-fintech-bg flex items-center justify-center text-fintech-muted">
      Redirecting to dashboard…
    </div>
  );
}
