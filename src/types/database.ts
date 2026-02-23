/**
 * Database structure definitions (for backend implementation).
 * Rewards issued ONLY from backend. Never trust frontend for rewards.
 */

export type MembershipTier = "starter" | "pro" | "elite" | "vip";

export type UserRole = "member" | "admin";

/** Users table: role, membership_tier, earnings_cents, balance_cents. Ready for Supabase. */
export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  membership_tier: MembershipTier;
  earnings_cents: number;
  balance_cents: number;
  withdrawable_cents: number;
  referral_code: string;
  referred_by_code: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Ad sessions: created when user clicks ad; timer must complete before reward */
export interface AdSessionRow {
  id: string;
  user_id: string;
  ad_id: string;
  started_at: Date;
  expires_at: Date;
  completed: boolean;
  reward_issued: boolean;
  created_at: Date;
}

/** Ad rewards: issued ONLY by backend after session validation */
export interface AdRewardRow {
  id: string;
  ad_session_id: string;
  user_id: string;
  amount_cents: number;
  issued_at: Date;
  issued_by: "backend";
}

/** Click tracking for fraud/bot detection */
export interface ClickTrackingRow {
  id: string;
  user_id: string;
  ad_id: string;
  clicked_at: Date;
  session_id: string;
  ip_hash?: string;
}

/** Referrals: referrer, referred users, referral earnings */
export interface ReferralRow {
  id: string;
  referrer_id: string;
  referred_id: string;
  referral_code: string;
  joined_at: Date;
  referral_earnings_cents: number;
}

/** Session tracking for security */
export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  device_id?: string;
  created_at: Date;
}
