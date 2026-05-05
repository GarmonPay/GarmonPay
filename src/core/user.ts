/*
 * CORE FILE — DO NOT MODIFY WITHOUT EXPLICIT INSTRUCTION.
 * CRITICAL FOR PLATFORM SECURITY.
 */

/**
 * Protected user service. Handle ONLY: getUserProfile, createUserProfile, updateUserProfile, getUserBalance.
 * No UI code.
 */

import { createBrowserClient } from "@/core/supabase";

export interface UserProfile {
  id: string;
  email: string;
  role: string;
  membership: string;
  gpay_coins: number;
  gold_coins: number;
  gpay_tokens: number;
  referral_code: string | null;
  referred_by_code: string | null;
}

/** Get user profile by id (client: use current user id; RLS restricts to own row). */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = createBrowserClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("users")
    .select("id, email, role, membership, gpay_coins, gold_coins, gpay_tokens, referral_code, referred_by_code")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    email: String(r.email ?? ""),
    role: String(r.role ?? "member"),
    membership: String(r.membership ?? "starter"),
    gpay_coins: Number((r as { gpay_coins?: number }).gpay_coins ?? 0),
    gold_coins: Number((r as { gold_coins?: number }).gold_coins ?? 0),
    gpay_tokens: Number((r as { gpay_tokens?: number }).gpay_tokens ?? 0),
    referral_code: r.referral_code != null ? String(r.referral_code) : null,
    referred_by_code: r.referred_by_code != null ? String(r.referred_by_code) : null,
  };
}

export interface CreateUserProfileInput {
  id: string;
  email: string;
  role?: string;
  gpay_coins?: number;
  gold_coins?: number;
  gpay_tokens?: number;
}

/** Create user profile row (e.g. after signup). Client: RLS allows insert with auth.uid() = id. */
export async function createUserProfile(input: CreateUserProfileInput): Promise<{ ok: boolean; message?: string }> {
  const supabase = createBrowserClient();
  if (!supabase) return { ok: false, message: "Not configured" };
  const { error } = await supabase.from("users").insert([{
    id: input.id,
    email: input.email,
    role: input.role ?? "member",
    // Canonical signup bonus: 50 GPC ($0.50 equivalent at 100 GPC = $1).
    gpay_coins: input.gpay_coins ?? 50,
    gold_coins: input.gold_coins ?? 0,
    gpay_tokens: input.gpay_tokens ?? 0,
    created_at: new Date().toISOString(),
  }]);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export interface UpdateUserProfileInput {
  referred_by_code?: string;
  membership?: string;
  [key: string]: unknown;
}

/** Update user profile by id (client: RLS restricts to own row). */
export async function updateUserProfile(userId: string, updates: UpdateUserProfileInput): Promise<{ ok: boolean; message?: string }> {
  const supabase = createBrowserClient();
  if (!supabase) return { ok: false, message: "Not configured" };
  const { error } = await supabase.from("users").update(updates).eq("id", userId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** Get canonical user currency balances (client: use current user id). */
export async function getUserBalance(
  userId: string
): Promise<{ gpay_coins: number; gold_coins: number; gpay_tokens: number } | null> {
  const supabase = createBrowserClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("users")
    .select("gpay_coins, gold_coins, gpay_tokens")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    gpay_coins: Number((data as { gpay_coins?: number }).gpay_coins ?? 0),
    gold_coins: Number((data as { gold_coins?: number }).gold_coins ?? 0),
    gpay_tokens: Number((data as { gpay_tokens?: number }).gpay_tokens ?? 0),
  };
}
