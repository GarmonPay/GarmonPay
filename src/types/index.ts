/**
 * GarmonPay — Production fintech types
 * No fake data. All structures for real backend integration.
 */

export type MembershipTier = "starter" | "pro" | "elite" | "vip";

export interface User {
  id: string;
  email: string;
  membershipTier: MembershipTier;
  earningsCents: number;
  balanceCents: number;
  withdrawableCents: number;
  referralCode: string;
  createdAt: string;
}

export interface Session {
  userId: string;
  sessionId: string;
  expiresAt: string;
  deviceId?: string;
}

export interface AdSession {
  id: string;
  userId: string;
  adId: string;
  startedAt: string;
  expiresAt: string;
  completed: boolean;
  rewardIssued: boolean;
}

export interface AdReward {
  id: string;
  adSessionId: string;
  userId: string;
  amountCents: number;
  issuedAt: string;
  issuedBy: "backend";
}

export interface ClickTracking {
  id: string;
  userId: string;
  adId: string;
  clickedAt: string;
  sessionId: string;
}

export interface Referral {
  referrerId: string;
  referredId: string;
  referralCode: string;
  joinedAt: string;
  earningsCents: number;
}

export interface EarningsSummary {
  todayCents: number;
  weekCents: number;
  monthCents: number;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
}
