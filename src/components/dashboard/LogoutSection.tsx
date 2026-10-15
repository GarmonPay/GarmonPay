"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/api";
import { clearSession } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";

/** End the Supabase session and the local fallback session. */
export async function signOutClient(): Promise<void> {
  const supabase = createBrowserClient();
  if (supabase) {
    await supabase.auth.signOut();
  } else {
    try {
      await logout();
    } catch {
      // Local session is still cleared below.
    }
  }
  clearSession();
}

export function LogoutSection({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await signOutClient();
    } finally {
      router.push("/");
      setBusy(false);
    }
  }

  return (
    <section
      className={`rounded-xl border border-white/10 bg-fintech-bg-card p-4 ${className ?? ""}`}
      aria-label="Log out"
    >
      <h2 className="text-sm font-semibold text-white">Log out</h2>
      <p className="mt-1 text-sm text-fintech-muted">Sign out of GarmonPay on this device.</p>
      <button
        type="button"
        onClick={() => void handleLogout()}
        disabled={busy}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/15 disabled:opacity-60"
      >
        <span aria-hidden>🚪</span>
        {busy ? "Signing out…" : "Log out"}
      </button>
    </section>
  );
}
