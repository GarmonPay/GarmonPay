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

type AdvertiserRow = {
  id: string;
  user_id: string;
  business_name: string;
  category: string | null;
  is_verified: boolean;
  is_active: boolean;
  total_spent: number;
  created_at: string;
};

type TopEarner = { user_id: string; total: number };
type FraudFlag = { id: string; user_id: string; ad_id: string | null; reason: string; created_at: string };
type BlockedIp = { id: string; ip_prefix: string; reason: string | null; created_at: string };
type BannedUser = { user_id: string; reason: string | null; created_at: string };

export default function AdminGarmonAdsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [pending, setPending] = useState<GarmonAd[]>([]);
  const [allAds, setAllAds] = useState<GarmonAd[]>([]);
  const [advertisers, setAdvertisers] = useState<AdvertiserRow[]>([]);
  const [topEarners, setTopEarners] = useState<TopEarner[]>([]);
  const [fraudFlags, setFraudFlags] = useState<FraudFlag[]>([]);
  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [blockedIpInput, setBlockedIpInput] = useState("");
  const [banReason, setBanReason] = useState("");
  const [engagementsForUser, setEngagementsForUser] = useState<Array<{ id: string; ad_id: string; engagement_type: string; duration_seconds: number; user_earned: number; created_at: string; ip_address: string | null }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [activeTab, setActiveTab] = useState<"queue" | "ads" | "advertisers" | "earners" | "fraud">("queue");

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/admin/garmon-ads?status=pending`, { headers: adminApiHeaders(session) }).then((r) => r.json()),
      fetch(`${API_BASE}/admin/garmon-ads`, { headers: adminApiHeaders(session) }).then((r) => r.json()),
      fetch(`${API_BASE}/admin/garmon-ads/advertisers`, { headers: adminApiHeaders(session) }).then((r) => r.json()),
      fetch(`${API_BASE}/admin/garmon-ads/top-earners`, { headers: adminApiHeaders(session) }).then((r) => r.json()),
      fetch(`${API_BASE}/admin/garmon-ads/fraud-flags`, { headers: adminApiHeaders(session) }).then((r) => r.json()),
      fetch(`${API_BASE}/admin/garmon-ads/blocked-ips`, { headers: adminApiHeaders(session) }).then((r) => r.json()),
      fetch(`${API_BASE}/admin/garmon-ads/banned-users`, { headers: adminApiHeaders(session) }).then((r) => r.json()),
    ])
      .then(([pendingRes, allRes, advRes, earnRes, fraudRes, blockedRes, bannedRes]) => {
        setPending(pendingRes.ads ?? []);
        setAllAds(allRes.ads ?? []);
        setAdvertisers(advRes.advertisers ?? []);
        setTopEarners(earnRes.topEarners ?? []);
        setFraudFlags(fraudRes.flags ?? []);
        setBlockedIps(blockedRes.blockedIps ?? []);
        setBannedUsers(bannedRes.bannedUsers ?? []);
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

  async function removeFraudFlag(flagId: string) {
    if (!session) return;
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/garmon-ads/fraud-flags`, {
        method: "PATCH",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ flagId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.message as string) || "Failed");
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Remove flag failed");
    }
  }

  async function banUser(userId: string) {
    if (!session) return;
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/garmon-ads/fraud-flags/ban`, {
        method: "POST",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ userId, reason: banReason || "Banned from ad earnings" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.message as string) || "Failed");
      setBanReason("");
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Ban failed");
    }
  }

  async function viewEngagements(userId: string) {
    if (!session) return;
    try {
      const res = await fetch(`${API_BASE}/admin/garmon-ads/user-engagements?userId=${encodeURIComponent(userId)}`, { headers: adminApiHeaders(session) });
      const data = await res.json().catch(() => ({}));
      setEngagementsForUser(res.ok ? (data.engagements ?? []) : []);
    } catch {
      setEngagementsForUser([]);
    }
  }

  async function addBlockedIp() {
    if (!session || !blockedIpInput.trim()) return;
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/garmon-ads/blocked-ips`, {
        method: "POST",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ ipPrefix: blockedIpInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.message as string) || "Failed");
      setBlockedIpInput("");
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Add blocked IP failed");
    }
  }

  async function removeBlockedIp(id: string) {
    if (!session) return;
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/garmon-ads/blocked-ips?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: adminApiHeaders(session) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.message as string) || "Failed");
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Remove failed");
    }
  }

  async function unbanUser(userId: string) {
    if (!session) return;
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/garmon-ads/banned-users?userId=${encodeURIComponent(userId)}`, { method: "DELETE", headers: adminApiHeaders(session) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.message as string) || "Failed");
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unban failed");
    }
  }

  async function advertiserAction(advertiserId: string, action: string) {
    if (!session) return;
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/garmon-ads/advertisers`, {
        method: "PATCH",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ advertiserId, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.message as string) || "Failed");
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    }
  }

  const totalSpend = allAds.reduce((s, a) => s + (Number(a.total_budget) - Number(a.remaining_budget)), 0);
  const totalAdminCut = allAds.reduce((s, a) => s + Number(a.total_admin_cut ?? 0), 0);
  const totalPaidToUsers = allAds.reduce((s, a) => s + Number(a.total_paid_to_users ?? 0), 0);

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">GarmonPay Ads</h1>
        <p className="text-[#9ca3af]">Moderate ads, revenue overview, advertisers, fraud.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(["queue", "ads", "advertisers", "earners", "fraud"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize ${activeTab === tab ? "bg-fintech-accent text-white" : "bg-white/10 text-[#9ca3af] hover:bg-white/15"}`}
          >
            {tab === "queue" ? "Moderation" : tab === "ads" ? "All ads" : tab === "earners" ? "Top earners" : tab}
          </button>
        ))}
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
      {activeTab === "queue" && (
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
      )}

      {/* All ads table */}
      {activeTab === "ads" && (
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
      )}

      {/* Advertisers */}
      {activeTab === "advertisers" && (
      <div className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
        <h2 className="text-lg font-semibold text-white p-4 border-b border-white/10">Advertisers</h2>
        {advertisers.length === 0 ? (
          <div className="p-6 text-[#9ca3af]">No advertisers.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-3 text-[#9ca3af]">Business</th>
                  <th className="p-3 text-[#9ca3af]">User ID</th>
                  <th className="p-3 text-[#9ca3af]">Total spent</th>
                  <th className="p-3 text-[#9ca3af]">Verified</th>
                  <th className="p-3 text-[#9ca3af]">Active</th>
                  <th className="p-3 text-[#9ca3af]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {advertisers.map((a) => (
                  <tr key={a.id} className="border-b border-white/5">
                    <td className="p-3 text-white">{a.business_name}</td>
                    <td className="p-3 text-[#9ca3af] font-mono text-xs">{a.user_id?.slice(0, 8)}…</td>
                    <td className="p-3 text-[#9ca3af]">${Number(a.total_spent).toFixed(2)}</td>
                    <td className="p-3">{a.is_verified ? <span className="text-green-400">Yes</span> : <span className="text-[#9ca3af]">No</span>}</td>
                    <td className="p-3">{a.is_active ? <span className="text-green-400">Yes</span> : <span className="text-red-400">Suspended</span>}</td>
                    <td className="p-3 flex gap-1">
                      <button type="button" onClick={() => advertiserAction(a.id, a.is_verified ? "unverify" : "verify")} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">{a.is_verified ? "Unverify" : "Verify"}</button>
                      <button type="button" onClick={() => advertiserAction(a.id, a.is_active ? "suspend" : "activate")} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">{a.is_active ? "Suspend" : "Activate"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Top earners */}
      {activeTab === "earners" && (
      <div className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
        <h2 className="text-lg font-semibold text-white p-4 border-b border-white/10">Top earners (this week)</h2>
        {topEarners.length === 0 ? (
          <div className="p-6 text-[#9ca3af]">No earnings this week.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-3 text-[#9ca3af]">#</th>
                  <th className="p-3 text-[#9ca3af]">User ID</th>
                  <th className="p-3 text-[#9ca3af]">Earned</th>
                </tr>
              </thead>
              <tbody>
                {topEarners.map((e, i) => (
                  <tr key={e.user_id} className="border-b border-white/5">
                    <td className="p-3 text-[#9ca3af]">{i + 1}</td>
                    <td className="p-3 font-mono text-xs text-white">{e.user_id}</td>
                    <td className="p-3 text-green-400">${e.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Fraud flags + Blocked IPs + Banned users */}
      {activeTab === "fraud" && (
      <div className="space-y-6">
        <div className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
          <h2 className="text-lg font-semibold text-white p-4 border-b border-white/10">Fraud flags</h2>
          {fraudFlags.length === 0 ? (
            <div className="p-6 text-[#9ca3af]">No fraud flags.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="p-3 text-[#9ca3af]">User ID</th>
                    <th className="p-3 text-[#9ca3af]">Reason</th>
                    <th className="p-3 text-[#9ca3af]">Date</th>
                    <th className="p-3 text-[#9ca3af]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fraudFlags.map((f) => (
                    <tr key={f.id} className="border-b border-white/5">
                      <td className="p-3 font-mono text-xs text-white">{f.user_id}</td>
                      <td className="p-3 text-[#9ca3af]">{f.reason}</td>
                      <td className="p-3 text-[#9ca3af]">{new Date(f.created_at).toLocaleString()}</td>
                      <td className="p-3 flex flex-wrap gap-1">
                        <button type="button" onClick={() => removeFraudFlag(f.id)} className="text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30">Remove flag</button>
                        <button type="button" onClick={() => banUser(f.user_id)} className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30">Ban from ads</button>
                        <button type="button" onClick={() => viewEngagements(f.user_id)} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">View engagements</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {engagementsForUser !== null && (
          <div className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
            <h2 className="text-lg font-semibold text-white p-4 border-b border-white/10">User engagements (last 50)</h2>
            <div className="p-2 flex justify-end">
              <button type="button" onClick={() => setEngagementsForUser(null)} className="text-xs text-[#9ca3af] hover:text-white">Close</button>
            </div>
            {engagementsForUser.length === 0 ? (
              <div className="p-6 text-[#9ca3af]">No engagements.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="p-3 text-[#9ca3af]">Type</th>
                      <th className="p-3 text-[#9ca3af]">Duration</th>
                      <th className="p-3 text-[#9ca3af]">Earned</th>
                      <th className="p-3 text-[#9ca3af]">IP</th>
                      <th className="p-3 text-[#9ca3af]">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {engagementsForUser.map((e) => (
                      <tr key={e.id} className="border-b border-white/5">
                        <td className="p-3 text-white">{e.engagement_type}</td>
                        <td className="p-3 text-[#9ca3af]">{e.duration_seconds}s</td>
                        <td className="p-3 text-green-400">${Number(e.user_earned).toFixed(4)}</td>
                        <td className="p-3 font-mono text-xs text-[#9ca3af]">{e.ip_address ?? "—"}</td>
                        <td className="p-3 text-[#9ca3af]">{new Date(e.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
          <h2 className="text-lg font-semibold text-white p-4 border-b border-white/10">Blocked IPs</h2>
          <div className="p-4 flex gap-2 flex-wrap">
            <input
              type="text"
              value={blockedIpInput}
              onChange={(e) => setBlockedIpInput(e.target.value)}
              placeholder="IP or prefix (e.g. 192.168. or full IP)"
              className="px-3 py-2 rounded bg-black/30 border border-white/10 text-white text-sm min-w-[200px]"
            />
            <button type="button" onClick={addBlockedIp} className="px-3 py-2 rounded bg-red-500/20 text-red-400 text-sm hover:bg-red-500/30">Add block</button>
          </div>
          {blockedIps.length === 0 ? (
            <div className="p-6 text-[#9ca3af]">No blocked IPs.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="p-3 text-[#9ca3af]">IP / Prefix</th>
                    <th className="p-3 text-[#9ca3af]">Reason</th>
                    <th className="p-3 text-[#9ca3af]">Added</th>
                    <th className="p-3 text-[#9ca3af]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {blockedIps.map((b) => (
                    <tr key={b.id} className="border-b border-white/5">
                      <td className="p-3 font-mono text-white">{b.ip_prefix}</td>
                      <td className="p-3 text-[#9ca3af]">{b.reason ?? "—"}</td>
                      <td className="p-3 text-[#9ca3af]">{new Date(b.created_at).toLocaleString()}</td>
                      <td className="p-3">
                        <button type="button" onClick={() => removeBlockedIp(b.id)} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
          <h2 className="text-lg font-semibold text-white p-4 border-b border-white/10">Banned users (ad earnings)</h2>
          <div className="p-4 border-b border-white/5">
            <input
              type="text"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Reason for new ban (used when you click Ban from ads)"
              className="w-full max-w-md px-3 py-2 rounded bg-black/30 border border-white/10 text-white text-sm"
            />
          </div>
          {bannedUsers.length === 0 ? (
            <div className="p-6 text-[#9ca3af]">No banned users.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="p-3 text-[#9ca3af]">User ID</th>
                    <th className="p-3 text-[#9ca3af]">Reason</th>
                    <th className="p-3 text-[#9ca3af]">Banned</th>
                    <th className="p-3 text-[#9ca3af]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bannedUsers.map((b) => (
                    <tr key={b.user_id} className="border-b border-white/5">
                      <td className="p-3 font-mono text-xs text-white">{b.user_id}</td>
                      <td className="p-3 text-[#9ca3af]">{b.reason ?? "—"}</td>
                      <td className="p-3 text-[#9ca3af]">{new Date(b.created_at).toLocaleString()}</td>
                      <td className="p-3">
                        <button type="button" onClick={() => unbanUser(b.user_id)} className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30">Unban</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
