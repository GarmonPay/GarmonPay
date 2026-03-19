"use client";

import { useEffect, useState, useCallback } from "react";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type GarmonAd = {
  id: string;
  title: string;
  description: string | null;
  ad_type: string;
  status: string;
  is_active: boolean;
  total_budget: number;
  remaining_budget: number;
  views: number;
  clicks: number;
  follows: number;
  shares: number;
  total_paid_to_users: number;
  total_admin_cut: number;
  created_at: string;
  advertisers?: { business_name: string; user_id: string } | null;
};

export default function AdminGarmonAdsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [pending, setPending] = useState<GarmonAd[]>([]);
  const [allAds, setAllAds] = useState<GarmonAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/admin/garmon-ads?status=pending`, { headers: adminApiHeaders(session) }).then((r) => r.json()),
      fetch(`${API_BASE}/admin/garmon-ads`, { headers: adminApiHeaders(session) }).then((r) => r.json()),
    ])
      .then(([pendingRes, allRes]) => {
        setPending(pendingRes.ads ?? []);
        setAllAds(allRes.ads ?? []);
        setError(null);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  async function approve(adId: string) {
    if (!session) return;
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/garmon-ads`, {
        method: "PATCH",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ adId, action: "approve" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.message as string) || "Failed");
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Approve failed");
    }
  }

  async function reject(adId: string) {
    if (!session) return;
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/garmon-ads`, {
        method: "PATCH",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ adId, action: "reject", rejectionReason: rejectionReason || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.message as string) || "Failed");
      setRejectionReason("");
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Reject failed");
    }
  }

  const totalSpend = allAds.reduce((s, a) => s + (Number(a.total_budget) - Number(a.remaining_budget)), 0);
  const totalAdminCut = allAds.reduce((s, a) => s + Number(a.total_admin_cut ?? 0), 0);
  const totalPaidToUsers = allAds.reduce((s, a) => s + Number(a.total_paid_to_users ?? 0), 0);

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">GarmonPay Ads</h1>
        <p className="text-[#9ca3af]">Moderate advertiser ads, revenue overview.</p>
      </div>

      {actionError && (
        <div className="p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{actionError}</div>
      )}

      {/* Revenue overview */}
      <div className="rounded-xl bg-[#111827] border border-white/10 p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-[#9ca3af] uppercase">Total ad spend</p>
          <p className="text-xl font-bold text-white">${totalSpend.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-[#9ca3af] uppercase">GarmonPay cut (50%)</p>
          <p className="text-xl font-bold text-green-400">${totalAdminCut.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-[#9ca3af] uppercase">Paid to users</p>
          <p className="text-xl font-bold text-white">${totalPaidToUsers.toFixed(2)}</p>
        </div>
      </div>

      {/* Moderation queue */}
      <div className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
        <h2 className="text-lg font-semibold text-white p-4 border-b border-white/10">Moderation queue (pending)</h2>
        {loading ? (
          <div className="p-6 text-[#9ca3af]">Loading…</div>
        ) : pending.length === 0 ? (
          <div className="p-6 text-[#9ca3af]">No pending ads.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {pending.map((ad) => (
              <div key={ad.id} className="p-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-white">{ad.title}</p>
                  <p className="text-sm text-[#9ca3af]">
                    {(ad.advertisers as { business_name?: string })?.business_name ?? "—"} · {ad.ad_type}
                  </p>
                  {ad.description && (
                    <p className="text-sm text-[#9ca3af] mt-1 line-clamp-2">{ad.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Rejection reason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="px-2 py-1 rounded bg-black/30 border border-white/10 text-white text-sm w-40"
                  />
                  <button
                    type="button"
                    onClick={() => approve(ad.id)}
                    className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-sm hover:bg-green-500/30"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => reject(ad.id)}
                    className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-sm hover:bg-red-500/30"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All ads table */}
      <div className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
        <h2 className="text-lg font-semibold text-white p-4 border-b border-white/10">All ads</h2>
        {error && <div className="p-4 text-red-400 text-sm">{error}</div>}
        {loading ? (
          <div className="p-6 text-[#9ca3af]">Loading…</div>
        ) : allAds.length === 0 ? (
          <div className="p-6 text-[#9ca3af]">No ads yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-3 text-[#9ca3af]">Title</th>
                  <th className="p-3 text-[#9ca3af]">Advertiser</th>
                  <th className="p-3 text-[#9ca3af]">Type</th>
                  <th className="p-3 text-[#9ca3af]">Status</th>
                  <th className="p-3 text-[#9ca3af]">Budget</th>
                  <th className="p-3 text-[#9ca3af]">Views</th>
                  <th className="p-3 text-[#9ca3af]">Spent</th>
                </tr>
              </thead>
              <tbody>
                {allAds.map((ad) => (
                  <tr key={ad.id} className="border-b border-white/5">
                    <td className="p-3 text-white">{ad.title}</td>
                    <td className="p-3 text-[#9ca3af]">{(ad.advertisers as { business_name?: string })?.business_name ?? "—"}</td>
                    <td className="p-3 text-[#9ca3af]">{ad.ad_type}</td>
                    <td className="p-3">
                      <span className={ad.status === "active" ? "text-green-400" : "text-[#9ca3af]"}>{ad.status}</span>
                    </td>
                    <td className="p-3 text-[#9ca3af]">${Number(ad.total_budget).toFixed(2)}</td>
                    <td className="p-3 text-[#9ca3af]">{ad.views}</td>
                    <td className="p-3 text-[#9ca3af]">${(Number(ad.total_budget) - Number(ad.remaining_budget)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
