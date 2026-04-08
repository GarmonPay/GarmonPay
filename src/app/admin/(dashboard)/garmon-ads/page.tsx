"use client";

import type { ComponentType, SVGProps } from "react";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";
import { AdminScrollHint, AdminTableWrap } from "@/components/admin/AdminTableScroll";
import {
  IconCreditCard,
  IconMegaphone,
  IconOverview,
  IconPeople,
  IconShield,
} from "@/components/admin/AdminGarmonTabIcons";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

const ACTION_BTN =
  "inline-flex items-center justify-center min-h-[36px] min-w-[60px] px-3 py-2 rounded-lg text-sm font-medium transition max-[480px]:w-full max-[480px]:min-w-0";

type TabId = "queue" | "ads" | "advertisers" | "earners" | "fraud";

const TAB_ORDER: TabId[] = ["queue", "earners", "advertisers", "ads", "fraud"];

const TAB_META: Record<TabId, { label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }> = {
  queue: { label: "Overview", Icon: IconOverview },
  earners: { label: "Transactions", Icon: IconCreditCard },
  advertisers: { label: "Members", Icon: IconPeople },
  ads: { label: "Ad Campaigns", Icon: IconMegaphone },
  fraud: { label: "Security Flags", Icon: IconShield },
};

type GarmonAd = {
  id: string;
  title: string;
  description: string | null;
  ad_type: string;
  /** `ad_packages.id` when created from dashboard plan picker */
  ad_package_id?: string | null;
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
  const [activeTab, setActiveTab] = useState<TabId>("queue");
  const [packageNamesById, setPackageNamesById] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/admin/garmon-ads?status=pending`, { credentials: "include", headers: adminApiHeaders(session) }).then((r) => r.json()),
      fetch(`${API_BASE}/admin/garmon-ads`, { credentials: "include", headers: adminApiHeaders(session) }).then((r) => r.json()),
      fetch(`${API_BASE}/admin/garmon-ads/advertisers`, { credentials: "include", headers: adminApiHeaders(session) }).then((r) => r.json()),
      fetch(`${API_BASE}/admin/garmon-ads/top-earners`, { credentials: "include", headers: adminApiHeaders(session) }).then((r) => r.json()),
      fetch(`${API_BASE}/admin/garmon-ads/fraud-flags`, { credentials: "include", headers: adminApiHeaders(session) }).then((r) => r.json()),
      fetch(`${API_BASE}/admin/garmon-ads/blocked-ips`, { credentials: "include", headers: adminApiHeaders(session) }).then((r) => r.json()),
      fetch(`${API_BASE}/admin/garmon-ads/banned-users`, { credentials: "include", headers: adminApiHeaders(session) }).then((r) => r.json()),
      fetch(`${API_BASE}/admin/ad-packages`, { credentials: "include", headers: adminApiHeaders(session) }).then((r) => r.json()),
    ])
      .then(([pendingRes, allRes, advRes, earnRes, fraudRes, blockedRes, bannedRes, pkgRes]) => {
        setPending(pendingRes.ads ?? []);
        setAllAds(allRes.ads ?? []);
        setAdvertisers(advRes.advertisers ?? []);
        setTopEarners(earnRes.topEarners ?? []);
        setFraudFlags(fraudRes.flags ?? []);
        setBlockedIps(blockedRes.blockedIps ?? []);
        setBannedUsers(bannedRes.bannedUsers ?? []);
        const pkgs = (pkgRes.packages ?? []) as Array<{ id?: string; name?: string }>;
        setPackageNamesById(
          Object.fromEntries(
            pkgs.filter((p) => p?.id).map((p) => [p.id as string, String(p.name ?? p.id)])
          )
        );
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
        credentials: "include",
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
        credentials: "include",
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
        credentials: "include",
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
        credentials: "include",
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
      const res = await fetch(`${API_BASE}/admin/garmon-ads/user-engagements?userId=${encodeURIComponent(userId)}`, { credentials: "include", headers: adminApiHeaders(session) });
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
        credentials: "include",
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
      const res = await fetch(`${API_BASE}/admin/garmon-ads/blocked-ips?id=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include", headers: adminApiHeaders(session) });
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
      const res = await fetch(`${API_BASE}/admin/garmon-ads/banned-users?userId=${encodeURIComponent(userId)}`, { method: "DELETE", credentials: "include", headers: adminApiHeaders(session) });
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
        credentials: "include",
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
    <div className="space-y-8 py-6 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white mb-2">Admin Panel — Garmon Ads</h1>
          <p className="text-fintech-muted">Moderate ads, revenue overview, advertisers, and security.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap md:justify-end">
          <button
            type="button"
            className={`${ACTION_BTN} bg-white/10 text-fintech-muted hover:bg-white/15 border border-white/10`}
            onClick={() => {
              const rows = [
                ["Metric", "Value"],
                ["Total ad spend", String(totalSpend)],
                ["GarmonPay cut", String(totalAdminCut)],
                ["Paid to users", String(totalPaidToUsers)],
              ];
              const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `garmon-ads-overview-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Export CSV
          </button>
          <a
            href="/admin/ads"
            className={`${ACTION_BTN} text-center bg-fintech-highlight/20 text-fintech-highlight border border-fintech-highlight/40 hover:bg-fintech-highlight/30 no-underline`}
          >
            New ad (site ads)
          </a>
        </div>
      </div>

      <div className="relative md:mb-2">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-fintech-bg via-fintech-bg/60 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-fintech-bg via-fintech-bg/60 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-amber-500/25 via-transparent to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-amber-500/25 via-transparent to-transparent"
          aria-hidden
        />
        <div className="overflow-x-auto pb-1 md:pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max min-w-full gap-2 flex-nowrap">
            {TAB_ORDER.map((tab) => {
              const { label, Icon } = TAB_META[tab];
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex shrink-0 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium whitespace-nowrap min-w-[120px] max-[480px]:min-w-[120px] max-[480px]:flex-col max-[480px]:gap-1 max-[480px]:py-3 ${
                    active
                      ? "border-fintech-highlight bg-fintech-highlight/15 text-fintech-highlight"
                      : "border-white/10 bg-white/5 text-fintech-muted hover:bg-white/10"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {actionError && (
        <div className="p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{actionError}</div>
      )}

      {/* Revenue overview */}
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-4 md:p-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <div>
          <p className="text-xs text-fintech-muted uppercase">Total ad spend</p>
          <p className="text-xl font-bold text-white">${totalSpend.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-fintech-muted uppercase">GarmonPay cut (50%)</p>
          <p className="text-xl font-bold text-green-400">${totalAdminCut.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-fintech-muted uppercase">Paid to users</p>
          <p className="text-xl font-bold text-white">${totalPaidToUsers.toFixed(2)}</p>
        </div>
      </div>

      {/* Moderation queue */}
      {activeTab === "queue" && (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
        <div className="p-4 border-b border-white/10 space-y-2">
          <h2 className="text-lg font-semibold text-white">Moderation queue (pending)</h2>
          <p className="text-xs text-fintech-muted max-w-2xl">
            Stripe may have already credited <span className="text-fintech-muted">remaining_budget</span> while status is
            still pending. Approve only after content checks; funding is separate from going live.
          </p>
        </div>
        {loading ? (
          <div className="p-6 text-fintech-muted">Loading…</div>
        ) : pending.length === 0 ? (
          <div className="p-6 text-fintech-muted">No pending ads.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {pending.map((ad) => (
              <div key={ad.id} className="p-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-white">{ad.title}</p>
                  <p className="text-sm text-fintech-muted">
                    {(ad.advertisers as { business_name?: string })?.business_name ?? "—"} · {ad.ad_type}
                  </p>
                  {ad.description && (
                    <p className="text-sm text-fintech-muted mt-1 line-clamp-2">{ad.description}</p>
                  )}
                  <p className="text-xs text-fintech-muted mt-2">
                    Budget:{" "}
                    <span className="text-fintech-muted">
                      ${Number(ad.remaining_budget).toFixed(2)} remaining
                    </span>{" "}
                    · ${Number(ad.total_budget).toFixed(2)} total
                    {Number(ad.total_budget) > 0 && Number(ad.remaining_budget) <= 0 && (
                      <span className="text-amber-400/90"> · balance depleted</span>
                    )}
                  </p>
                  <p className="text-xs text-fintech-muted mt-1">
                    Package:{" "}
                    {ad.ad_package_id ? (
                      <Link
                        href="/admin/ad-packages"
                        className="text-violet-400 hover:underline"
                        title={ad.ad_package_id}
                      >
                        {packageNamesById[ad.ad_package_id] ?? `${ad.ad_package_id.slice(0, 8)}…`}
                      </Link>
                    ) : (
                      <span className="text-fintech-muted">—</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 max-[480px]:flex-col max-[480px]:w-full">
                  <input
                    type="text"
                    placeholder="Rejection reason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="px-2 py-2 rounded bg-black/30 border border-white/10 text-white text-sm w-full max-w-[200px] max-[480px]:max-w-none"
                  />
                  <button
                    type="button"
                    onClick={() => approve(ad.id)}
                    className={`${ACTION_BTN} bg-green-500/20 text-green-400 hover:bg-green-500/30`}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => reject(ad.id)}
                    className={`${ACTION_BTN} bg-red-500/20 text-red-400 hover:bg-red-500/30`}
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
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
        <h2 className="text-lg font-semibold text-white p-4 border-b border-white/10">All ads</h2>
        {error && <div className="p-4 text-red-400 text-sm">{error}</div>}
        {loading ? (
          <div className="p-6 text-fintech-muted">Loading…</div>
        ) : allAds.length === 0 ? (
          <div className="p-6 text-fintech-muted">No ads yet.</div>
        ) : (
          <>
            <AdminScrollHint />
            <AdminTableWrap>
              <table className="w-full text-left text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="p-3 text-fintech-muted hidden sm:table-cell">ID</th>
                    <th className="p-3 text-fintech-muted">Title</th>
                    <th className="p-3 text-fintech-muted">Advertiser</th>
                    <th className="p-3 text-fintech-muted">Type</th>
                    <th className="p-3 text-fintech-muted hidden lg:table-cell">Package</th>
                    <th className="p-3 text-fintech-muted">Status</th>
                    <th className="p-3 text-fintech-muted">Budget</th>
                    <th className="p-3 text-fintech-muted">Views</th>
                    <th className="p-3 text-fintech-muted">Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {allAds.map((ad) => (
                    <tr key={ad.id} className="border-b border-white/5">
                      <td className="p-3 font-mono text-xs text-fintech-muted hidden sm:table-cell">{ad.id.slice(0, 8)}…</td>
                      <td className="p-3 text-white">{ad.title}</td>
                      <td className="p-3 text-fintech-muted">{(ad.advertisers as { business_name?: string })?.business_name ?? "—"}</td>
                      <td className="p-3 text-fintech-muted">{ad.ad_type}</td>
                      <td className="p-3 text-fintech-muted font-mono text-xs hidden lg:table-cell">
                        {ad.ad_package_id ? (
                          <Link
                            href="/admin/ad-packages"
                            className="text-violet-400 hover:underline"
                            title="Edit packages"
                          >
                            {ad.ad_package_id}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3">
                        <span className={ad.status === "active" ? "text-green-400" : "text-fintech-muted"}>{ad.status}</span>
                      </td>
                      <td className="p-3 text-fintech-muted">${Number(ad.total_budget).toFixed(2)}</td>
                      <td className="p-3 text-fintech-muted">{ad.views}</td>
                      <td className="p-3 text-fintech-muted">${(Number(ad.total_budget) - Number(ad.remaining_budget)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableWrap>
          </>
        )}
      </div>
      )}

      {/* Advertisers */}
      {activeTab === "advertisers" && (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
        <h2 className="text-lg font-semibold text-white p-4 border-b border-white/10">Advertisers</h2>
        {advertisers.length === 0 ? (
          <div className="p-6 text-fintech-muted">No advertisers.</div>
        ) : (
          <>
            <AdminScrollHint />
            <AdminTableWrap>
              <table className="w-full text-left text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="p-3 text-fintech-muted">Business</th>
                    <th className="p-3 text-fintech-muted hidden sm:table-cell">User ID</th>
                    <th className="p-3 text-fintech-muted hidden sm:table-cell">Joined</th>
                    <th className="p-3 text-fintech-muted">Total spent</th>
                    <th className="p-3 text-fintech-muted">Verified</th>
                    <th className="p-3 text-fintech-muted">Active</th>
                    <th className="p-3 text-fintech-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {advertisers.map((a) => (
                    <tr key={a.id} className="border-b border-white/5">
                      <td className="p-3 text-white">{a.business_name}</td>
                      <td className="p-3 text-fintech-muted font-mono text-xs hidden sm:table-cell">{a.user_id?.slice(0, 8)}…</td>
                      <td className="p-3 text-fintech-muted text-xs hidden sm:table-cell">
                        {a.created_at ? new Date(a.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-3 text-fintech-muted">${Number(a.total_spent).toFixed(2)}</td>
                      <td className="p-3">{a.is_verified ? <span className="text-green-400">Yes</span> : <span className="text-fintech-muted">No</span>}</td>
                      <td className="p-3">{a.is_active ? <span className="text-green-400">Yes</span> : <span className="text-red-400">Suspended</span>}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2 max-[480px]:flex-col">
                          <button
                            type="button"
                            onClick={() => advertiserAction(a.id, a.is_verified ? "unverify" : "verify")}
                            className={`${ACTION_BTN} bg-white/10 hover:bg-white/20 text-white`}
                          >
                            {a.is_verified ? "Unverify" : "Verify"}
                          </button>
                          <button
                            type="button"
                            onClick={() => advertiserAction(a.id, a.is_active ? "suspend" : "activate")}
                            className={`${ACTION_BTN} bg-white/10 hover:bg-white/20 text-white`}
                          >
                            {a.is_active ? "Suspend" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableWrap>
          </>
        )}
      </div>
      )}

      {/* Top earners */}
      {activeTab === "earners" && (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
        <h2 className="text-lg font-semibold text-white p-4 border-b border-white/10">Top earners (this week)</h2>
        {topEarners.length === 0 ? (
          <div className="p-6 text-fintech-muted">No earnings this week.</div>
        ) : (
          <>
            <AdminScrollHint />
            <AdminTableWrap>
              <table className="w-full text-left text-sm min-w-[400px]">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="p-3 text-fintech-muted">#</th>
                    <th className="p-3 text-fintech-muted">User ID</th>
                    <th className="p-3 text-fintech-muted">Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {topEarners.map((e, i) => (
                    <tr key={e.user_id} className="border-b border-white/5">
                      <td className="p-3 text-fintech-muted">{i + 1}</td>
                      <td className="p-3 font-mono text-xs text-white">{e.user_id}</td>
                      <td className="p-3 text-green-400">${e.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableWrap>
          </>
        )}
      </div>
      )}

      {/* Fraud flags + Blocked IPs + Banned users */}
      {activeTab === "fraud" && (
      <div className="space-y-6">
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
          <h2 className="text-lg font-semibold text-white p-4 border-b border-white/10">Fraud flags</h2>
          {fraudFlags.length === 0 ? (
            <div className="p-6 text-fintech-muted">No fraud flags.</div>
          ) : (
            <>
              <div className="md:hidden space-y-4 p-4">
                {fraudFlags.map((f) => (
                  <div key={f.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs text-white break-all">{f.user_id.slice(0, 12)}…</span>
                      <span className="rounded-full border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">
                        Flagged
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-fintech-muted">{f.reason}</p>
                    <p className="mt-2 text-xs text-fintech-muted">{new Date(f.created_at).toLocaleString()}</p>
                    <div className="mt-4 flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => banUser(f.user_id)}
                        className={`${ACTION_BTN} w-full bg-red-500/20 text-red-400 hover:bg-red-500/30`}
                      >
                        Suspend
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFraudFlag(f.id)}
                        className={`${ACTION_BTN} w-full bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30`}
                      >
                        Resolve
                      </button>
                      <button
                        type="button"
                        onClick={() => viewEngagements(f.user_id)}
                        className={`${ACTION_BTN} w-full bg-white/10 hover:bg-white/20 text-white`}
                      >
                        View engagements
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block">
                <AdminScrollHint />
                <AdminTableWrap>
                  <table className="w-full text-left text-sm min-w-[720px]">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="p-3 text-fintech-muted">ID</th>
                        <th className="p-3 text-fintech-muted">User ID</th>
                        <th className="p-3 text-fintech-muted">Reason</th>
                        <th className="p-3 text-fintech-muted">Date</th>
                        <th className="p-3 text-fintech-muted">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fraudFlags.map((f) => (
                        <tr key={f.id} className="border-b border-white/5">
                          <td className="p-3 font-mono text-xs text-fintech-muted">{f.id.slice(0, 8)}…</td>
                          <td className="p-3 font-mono text-xs text-white">{f.user_id}</td>
                          <td className="p-3 text-fintech-muted">{f.reason}</td>
                          <td className="p-3 text-fintech-muted">{new Date(f.created_at).toLocaleString()}</td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-2 max-[480px]:flex-col">
                              <button
                                type="button"
                                onClick={() => removeFraudFlag(f.id)}
                                className={`${ACTION_BTN} bg-amber-500/20 text-amber-400 hover:bg-amber-500/30`}
                              >
                                Resolve
                              </button>
                              <button
                                type="button"
                                onClick={() => banUser(f.user_id)}
                                className={`${ACTION_BTN} bg-red-500/20 text-red-400 hover:bg-red-500/30`}
                              >
                                Suspend
                              </button>
                              <button
                                type="button"
                                onClick={() => viewEngagements(f.user_id)}
                                className={`${ACTION_BTN} bg-white/10 hover:bg-white/20 text-white`}
                              >
                                View
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </AdminTableWrap>
              </div>
            </>
          )}
        </div>

        {engagementsForUser !== null && (
          <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
            <h2 className="text-lg font-semibold text-white p-4 border-b border-white/10">User engagements (last 50)</h2>
            <div className="p-2 flex justify-end">
              <button type="button" onClick={() => setEngagementsForUser(null)} className="text-xs text-fintech-muted hover:text-white">Close</button>
            </div>
            {engagementsForUser.length === 0 ? (
              <div className="p-6 text-fintech-muted">No engagements.</div>
            ) : (
              <>
                <AdminScrollHint />
                <AdminTableWrap>
                  <table className="w-full text-left text-sm min-w-[720px]">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="p-3 text-fintech-muted">Type</th>
                        <th className="p-3 text-fintech-muted">Duration</th>
                        <th className="p-3 text-fintech-muted">Earned</th>
                        <th className="p-3 text-fintech-muted hidden sm:table-cell">IP Address</th>
                        <th className="p-3 text-fintech-muted">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {engagementsForUser.map((e) => (
                        <tr key={e.id} className="border-b border-white/5">
                          <td className="p-3 text-white">{e.engagement_type}</td>
                          <td className="p-3 text-fintech-muted">{e.duration_seconds}s</td>
                          <td className="p-3 text-green-400">${Number(e.user_earned).toFixed(4)}</td>
                          <td className="p-3 font-mono text-xs text-fintech-muted hidden sm:table-cell">{e.ip_address ?? "—"}</td>
                          <td className="p-3 text-fintech-muted">{new Date(e.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </AdminTableWrap>
              </>
            )}
          </div>
        )}

        <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
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
            <div className="p-6 text-fintech-muted">No blocked IPs.</div>
          ) : (
            <>
              <AdminScrollHint />
              <AdminTableWrap>
                <table className="w-full text-left text-sm min-w-[560px]">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="p-3 text-fintech-muted">IP / Prefix</th>
                      <th className="p-3 text-fintech-muted hidden sm:table-cell">Reason</th>
                      <th className="p-3 text-fintech-muted hidden sm:table-cell">Added</th>
                      <th className="p-3 text-fintech-muted">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blockedIps.map((b) => (
                      <tr key={b.id} className="border-b border-white/5">
                        <td className="p-3 font-mono text-white">{b.ip_prefix}</td>
                        <td className="p-3 text-fintech-muted hidden sm:table-cell">{b.reason ?? "—"}</td>
                        <td className="p-3 text-fintech-muted hidden sm:table-cell">{new Date(b.created_at).toLocaleString()}</td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => removeBlockedIp(b.id)}
                            className={`${ACTION_BTN} bg-white/10 hover:bg-white/20 text-white`}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableWrap>
            </>
          )}
        </div>

        <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
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
            <div className="p-6 text-fintech-muted">No banned users.</div>
          ) : (
            <>
              <AdminScrollHint />
              <AdminTableWrap>
                <table className="w-full text-left text-sm min-w-[560px]">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="p-3 text-fintech-muted">User ID</th>
                      <th className="p-3 text-fintech-muted hidden sm:table-cell">Reason</th>
                      <th className="p-3 text-fintech-muted hidden sm:table-cell">Banned</th>
                      <th className="p-3 text-fintech-muted">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bannedUsers.map((b) => (
                      <tr key={b.user_id} className="border-b border-white/5">
                        <td className="p-3 font-mono text-xs text-white">{b.user_id.slice(0, 12)}…</td>
                        <td className="p-3 text-fintech-muted hidden sm:table-cell">{b.reason ?? "—"}</td>
                        <td className="p-3 text-fintech-muted hidden sm:table-cell">{new Date(b.created_at).toLocaleString()}</td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => unbanUser(b.user_id)}
                            className={`${ACTION_BTN} bg-green-500/20 text-green-400 hover:bg-green-500/30`}
                          >
                            Unban
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableWrap>
            </>
          )}
        </div>
      </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-fintech-bg-card/95 backdrop-blur-md md:hidden safe-area-pb"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Garmon Ads sections"
      >
        <div className="flex justify-around items-stretch gap-1 px-1 py-2 max-w-lg mx-auto">
          {TAB_ORDER.map((tab) => {
            const { label, Icon } = TAB_META[tab];
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium leading-tight ${
                  active ? "text-fintech-highlight" : "text-fintech-muted"
                }`}
              >
                <Icon className={`h-6 w-6 ${active ? "text-fintech-highlight" : "text-fintech-muted"}`} />
                <span className="max-w-[4.5rem] text-center text-[9px] leading-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
