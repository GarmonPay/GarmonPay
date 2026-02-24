"use client";

import { useEffect, useState } from "react";
import { getAdminSession } from "@/lib/admin-session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

interface AdminStats {
  totalUsers: number;
  totalEarningsCents: number;
  totalAds: number;
  totalReferralEarningsCents: number;
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
  const session = getAdminSession();

  useEffect(() => {
    if (!session) return;
    fetch(`${API_BASE}/admin/stats`, {
      headers: { "X-Admin-Id": session.adminId },
    })
      .then((res) => res.ok ? res.json() : res.json().then((b: { message?: string }) => { throw new Error(b.message ?? "Failed to load stats"); }))
      .then((data) => {
        setStats({
          totalUsers: data?.totalUsers ?? 0,
          totalEarningsCents: data?.totalEarningsCents ?? 0,
          totalAds: data?.totalAds ?? 0,
          totalReferralEarningsCents: data?.totalReferralEarningsCents ?? 0,
          recentRegistrations: Array.isArray(data?.recentRegistrations) ? data.recentRegistrations : [],
          recentAdClicks: Array.isArray(data?.recentAdClicks) ? data.recentAdClicks : [],
          platformTotalEarningsCents: data?.platformTotalEarningsCents,
          platformTotalWithdrawalsCents: data?.platformTotalWithdrawalsCents,
          platformTotalAdCreditCents: data?.platformTotalAdCreditCents,
        });
        setError(null);
      })
      .catch(() => {
        setError(null);
        setStats({
          totalUsers: 0,
          totalEarningsCents: 0,
          totalAds: 0,
          totalReferralEarningsCents: 0,
          recentRegistrations: [],
          recentAdClicks: [],
          platformTotalEarningsCents: 0,
          platformTotalWithdrawalsCents: 0,
          platformTotalAdCreditCents: 0,
        });
      });
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
          <p className="text-2xl font-bold text-white mt-1">{stats.totalUsers}</p>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <p className="text-sm text-[#9ca3af] uppercase tracking-wide">Total Platform Earnings</p>
          <p className="text-2xl font-bold text-[#10b981] mt-1">
            {formatCents(stats.platformTotalEarningsCents ?? stats.totalEarningsCents ?? 0)}
          </p>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <p className="text-sm text-[#9ca3af] uppercase tracking-wide">Total Withdrawals</p>
          <p className="text-2xl font-bold text-white mt-1">
            {formatCents(stats.platformTotalWithdrawalsCents ?? 0)}
          </p>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <p className="text-sm text-[#9ca3af] uppercase tracking-wide">Total Ad Credit Usage</p>
          <p className="text-2xl font-bold text-[#10b981] mt-1">
            {formatCents(stats.platformTotalAdCreditCents ?? 0)}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4 mb-8">
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <p className="text-sm text-[#9ca3af] uppercase tracking-wide">Total Ads</p>
          <p className="text-2xl font-bold text-white mt-1">{stats.totalAds}</p>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <p className="text-sm text-[#9ca3af] uppercase tracking-wide">Referral Earnings</p>
          <p className="text-2xl font-bold text-[#10b981] mt-1">
            {formatCents(stats.totalReferralEarningsCents)}
          </p>
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
