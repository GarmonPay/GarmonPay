/**
 * Admin stats from backend. No fake data.
 * In production, replace with Supabase queries.
 */

import { listUsers, getUserRole } from "./auth-store";

export interface AdminStats {
  totalUsers: number;
  totalEarningsCents: number;
  totalAds: number;
  totalReferralEarningsCents: number;
  recentRegistrations: { id: string; email: string; role: string; createdAt: string }[];
  recentAdClicks: { id: string; userId: string; adId: string; clickedAt: string }[];
}

/** In-memory placeholder for ad clicks. Replace with DB. */
const adClicks: { id: string; userId: string; adId: string; clickedAt: string }[] = [];

export function getAdminStats(): AdminStats {
  const users = listUsers();
  const recent = [...users]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)
    .map((u) => ({
      id: u.id,
      email: u.email,
      role: getUserRole(u),
      createdAt: u.createdAt,
    }));

  return {
    totalUsers: users.length,
    totalEarningsCents: 0,
    totalAds: 0,
    totalReferralEarningsCents: 0,
    recentRegistrations: recent,
    recentAdClicks: [...adClicks].reverse().slice(-20),
  };
}

export function addAdClick(data: { userId: string; adId: string }): void {
  adClicks.push({
    id: `click_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    userId: data.userId,
    adId: data.adId,
    clickedAt: new Date().toISOString(),
  });
}
