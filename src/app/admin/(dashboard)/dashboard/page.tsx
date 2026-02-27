"use client";

import { useEffect, useMemo, useState } from "react";
import { getAdminSession } from "@/lib/admin-session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

interface AdminStats {
  totalUsers: number;
  totalEarningsCents: number;
  totalAds: number;
  totalReferralEarningsCents: number;
  totalDepositsCents?: number;
  recentRegistrations: { id: string; email: string; role: string; createdAt: string }[];
  recentAdClicks: { id: string; userId: string; adId: string; clickedAt: string }[];
  platformTotalEarningsCents?: number;
  platformTotalWithdrawalsCents?: number;
  platformTotalAdCreditCents?: number;
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = useMemo(() => getAdminSession(), []);

  useEffect(() => {
    const adminId = session?.adminId;
    if (!adminId) return;
    const adminIdHeader: string = adminId;
    let cancelled = false;

    async function loadStats() {
      try {
        const res = await fetch(`${API_BASE}/admin/stats`, {
          headers: { "X-Admin-Id": adminIdHeader },
          cache: "no-store",
        });
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
          totalUsers?: number;
          totalEarningsCents?: number;
          totalAds?: number;
          totalReferralEarningsCents?: number;
          totalDepositsCents?: number;
          recentRegistrations?: AdminStats["recentRegistrations"];
          recentAdClicks?: AdminStats["recentAdClicks"];
          platformTotalEarningsCents?: number;
          platformTotalWithdrawalsCents?: number;
          platformTotalAdCreditCents?: number;
        };
        if (!res.ok) {
          throw new Error(body.message ?? "Failed to load stats");
        }
        if (cancelled) return;
        setStats({
          totalUsers: body.totalUsers ?? 0,
          totalEarningsCents: body.totalEarningsCents ?? 0,
          totalAds: body.totalAds ?? 0,
          totalReferralEarningsCents: body.totalReferralEarningsCents ?? 0,
          totalDepositsCents: body.totalDepositsCents,
          recentRegistrations: Array.isArray(body.recentRegistrations) ? body.recentRegistrations : [],
          recentAdClicks: Array.isArray(body.recentAdClicks) ? body.recentAdClicks : [],
          platformTotalEarningsCents: body.platformTotalEarningsCents,
          platformTotalWithdrawalsCents: body.platformTotalWithdrawalsCents,
          platformTotalAdCreditCents: body.platformTotalAdCreditCents,
        });
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setStats(null);
        setError(err instanceof Error ? err.message : "Failed to load stats");
      }
    }

    void loadStats();
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[40vh] text-[#9ca3af]">
        Loading…
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <p className="text-sm text-[#9ca3af] uppercase tracking-wide">Total Users</p>
          <p className="text-2xl font-bold text-white mt-1">{stats.totalUsers.toLocaleString()}</p>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <p className="text-sm text-[#9ca3af] uppercase tracking-wide">Total Deposits</p>
          <p className="text-2xl font-bold text-[#10b981] mt-1">
            {formatCents(stats.totalDepositsCents ?? 0)}
          </p>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <p className="text-sm text-[#9ca3af] uppercase tracking-wide">Total Withdrawals</p>
          <p className="text-2xl font-bold text-white mt-1">
            {formatCents(stats.platformTotalWithdrawalsCents ?? 0)}
          </p>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <p className="text-sm text-[#9ca3af] uppercase tracking-wide">Total Revenue</p>
          <p className="text-2xl font-bold text-[#10b981] mt-1">
            {formatCents((stats.platformTotalEarningsCents ?? 0) + (stats.totalDepositsCents ?? 0))}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4 mb-8">
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <p className="text-sm text-[#9ca3af] uppercase tracking-wide">Platform Earnings</p>
          <p className="text-2xl font-bold text-white mt-1">
            {formatCents(stats.platformTotalEarningsCents ?? stats.totalEarningsCents ?? 0)}
          </p>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <p className="text-sm text-[#9ca3af] uppercase tracking-wide">Ad Credit Usage</p>
          <p className="text-2xl font-bold text-[#10b981] mt-1">
            {formatCents(stats.platformTotalAdCreditCents ?? 0)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <p className="text-sm text-[#9ca3af] uppercase tracking-wide">Total Ads</p>
          <p className="text-2xl font-bold text-white mt-1">{stats.totalAds}</p>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <p className="text-sm text-[#9ca3af] uppercase tracking-wide">Referral Earnings</p>
          <p className="text-2xl font-bold text-[#10b981] mt-1">{formatCents(stats.totalReferralEarningsCents)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="rounded-xl bg-[#111827] border border-white/10 p-6">
          <h2 className="text-lg font-bold text-white mb-4">Recent Registrations</h2>
          {stats.recentRegistrations.length === 0 ? (
            <p className="text-[#9ca3af] text-sm">No registrations yet.</p>
          ) : (
            <ul className="space-y-3">
              {stats.recentRegistrations.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
                >
                  <span className="text-white font-medium truncate">{u.email}</span>
                  <span className="text-[#9ca3af] text-sm capitalize">{u.role}</span>
                  <span className="text-[#6b7280] text-xs">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl bg-[#111827] border border-white/10 p-6">
          <h2 className="text-lg font-bold text-white mb-4">Recent Ad Clicks</h2>
          {stats.recentAdClicks.length === 0 ? (
            <p className="text-[#9ca3af] text-sm">No ad clicks yet.</p>
          ) : (
            <ul className="space-y-3">
              {stats.recentAdClicks.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 text-sm"
                >
                  <span className="text-[#9ca3af]">User {c.userId.slice(0, 12)}…</span>
                  <span className="text-[#6b7280]">{c.adId}</span>
                  <span className="text-[#6b7280]">{new Date(c.clickedAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
