"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";

export default function AuthConfirmPage() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    if (!supabase) {
      setTimedOut(true);
      return;
    }

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        router.push("/dashboard");
      }
    });

    // Fallback: if nothing happens in 5 seconds show the manual link
    const timer = setTimeout(() => setTimedOut(true), 5000);

    return () => {
      clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "#0e0118" }}
    >
      <style>{`
        @keyframes gp-spin {
          to { transform: rotate(360deg); }
        }
        .gp-spinner {
          width: 56px;
          height: 56px;
          border: 4px solid rgba(245,200,66,0.15);
          border-top-color: #F5C842;
          border-radius: 50%;
          animation: gp-spin 0.9s linear infinite;
        }
      `}</style>

      <div className="gp-spinner" />

      <p className="mt-6 text-base font-medium text-white/90">
        Confirming your account…
      </p>

      {timedOut && (
        <div className="mt-8 text-center">
          <p className="text-sm text-white/60 mb-3">Having trouble?</p>
          <Link
            href="/login"
            className="text-sm font-medium underline underline-offset-4"
            style={{ color: "#F5C842" }}
          >
            Click here to login
          </Link>
        </div>
      )}
    </div>
  );
}
