"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type SeasonPassState = {
  active: boolean;
  status: string;
  currentPeriodEnd: string | null;
  perks: string[];
};

export default function ArenaSeasonPassPage() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [state, setState] = useState<SeasonPassState | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSessionAsync();
      if (!s) return;
      setSession(s);
      const token = s.accessToken ?? s.userId;
      const headers: Record<string, string> = s.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token };
      const res = await fetch(`${API_BASE}/arena/season-pass`, { headers, credentials: "include" });
      const data = res.ok ? await res.json() : null;
      if (data) setState(data);
      setLoading(false);
    })();
  }, []);

  const startCheckout = async () => {
    if (!session) return;
    setCheckoutLoading(true);
    const token = session.accessToken ?? session.userId;
    const headers: Record<string, string> = { "Content-Type": "application/json", ...(session.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token }) };
    const res = await fetch(`${API_BASE}/arena/season-pass/checkout`, { method: "POST", headers, credentials: "include", body: "{}" });
    const data = await res.json().catch(() => ({}));
    if (data?.url) window.location.href = data.url;
    setCheckoutLoading(false);
  };

  const openPortal = async () => {
    if (!session) return;
    setPortalLoading(true);
    const token = session.accessToken ?? session.userId;
    const headers: Record<string, string> = { "Content-Type": "application/json", ...(session.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token }) };
    const res = await fetch(`${API_BASE}/arena/season-pass/portal`, { method: "POST", headers, credentials: "include", body: "{}" });
    const data = await res.json().catch(() => ({}));
    if (data?.url) window.location.href = data.url;
    setPortalLoading(false);
  };

  if (loading || !session) {
    return <div className="p-6 text-[#9ca3af]">Loading…</div>;
  }

  return (
    <div className="rounded-xl bg-[#161b22] border border-white/10 p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Arena Season Pass</h1>
        <Link href="/dashboard/arena" className="text-[#f0a500] hover:underline">Back to Arena</Link>
      </div>
      <p className="text-[#9ca3af] mb-4">$9.99/month. Cancel anytime. Unlock double login coins, extra daily spin, 10% store discount, VIP tournament access, and an exclusive title.</p>

      {state?.active ? (
        <div className="space-y-4">
          <p className="text-[#86efac] font-medium">Active — your perks:</p>
          <ul className="list-disc list-inside text-[#d1d5db] space-y-1">
            {state.perks.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
          {state.currentPeriodEnd && <p className="text-sm text-[#9ca3af]">Current period ends: {new Date(state.currentPeriodEnd).toLocaleDateString()}</p>}
          <button type="button" onClick={openPortal} disabled={portalLoading} className="px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-50">Manage / Cancel</button>
        </div>
      ) : (
        <div>
          <p className="text-[#9ca3af] mb-4">You don’t have an active Season Pass.</p>
          <button type="button" onClick={startCheckout} disabled={checkoutLoading} className="px-4 py-2 rounded-lg bg-[#f0a500] text-black font-medium hover:bg-[#e09500] disabled:opacity-50">
            {checkoutLoading ? "…" : "Subscribe — $9.99/mo"}
          </button>
        </div>
      )}
    </div>
  );
}
