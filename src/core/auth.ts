/*
 * CORE FILE — DO NOT MODIFY WITHOUT EXPLICIT INSTRUCTION.
 * CRITICAL FOR PLATFORM SECURITY.
 */

/**
 * Protected auth service. Handle ONLY: login, register, getCurrentUser, logout.
 * No UI code.
 */

import { createBrowserClient } from "@/core/supabase";
import { setSession, clearSession } from "@/lib/session";
import { isAtLeastAge } from "@/lib/signup-compliance";
import { isStateExcludedFromParticipation, isValidUsStateCode } from "@/lib/us-states";

export interface AuthUser {
  id: string;
  email: string;
  role?: string;
  isSuperAdmin?: boolean;
}

export type LoginResult =
  | { ok: true; user: AuthUser; isAdmin: boolean }
  | { ok: false; message: string };

/** Login with email/password (Supabase Auth). Returns session user and role from users table. */
export async function login(email: string, password: string): Promise<LoginResult> {
  const supabase = createBrowserClient();
  if (!supabase) {
    return { ok: false, message: "Auth not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local" };
  }
  const trimmedEmail = email.trim();
  if (!trimmedEmail) return { ok: false, message: "Email is required" };
  if (!password) return { ok: false, message: "Password is required" };
  const { data, error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
  if (error) {
    const msg = error.message || "Invalid email or password";
    return { ok: false, message: msg };
  }
  if (!data.session?.user) return { ok: false, message: "Login failed. No session." };
  const authUser = data.user as { email_confirmed_at?: string | null };
  if (authUser.email_confirmed_at == null || authUser.email_confirmed_at === "") {
    await supabase.auth.signOut();
    return { ok: false, message: "Please verify your email before logging in. Check your inbox for the verification link." };
  }
  const uid = data.user.id;
  let role = "member";
  let isSuperAdmin = false;
  try {
    const { data: row } = await supabase.from("users").select("role, is_super_admin").eq("id", uid).maybeSingle();
    if (row && (row as { role?: string }).role) role = (row as { role: string }).role;
    if (row) isSuperAdmin = !!(row as { is_super_admin?: boolean }).is_super_admin;
  } catch {
    try {
      const { data: row } = await supabase.from("users").select("role").eq("id", uid).maybeSingle();
      if (row && (row as { role?: string }).role) role = (row as { role: string }).role;
    } catch {
      // keep defaults
    }
  }
  const user: AuthUser = { id: data.user.id, email: data.user.email ?? "", role, isSuperAdmin };
  setSession({
    userId: data.user.id,
    email: data.user.email ?? "",
    expiresAt: data.session.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : "",
    accessToken: data.session.access_token,
  });
  return { ok: true, user, isAdmin: role === "admin" || isSuperAdmin };
}

export interface RegisterOptions {
  email: string;
  password: string;
  referralCode?: string;
  fullName?: string;
  /** ISO date YYYY-MM-DD; must be 18+. */
  dateOfBirth: string;
  /** US state code (e.g. CA). Washington (WA) is not eligible. */
  residenceState: string;
}

export type RegisterResult =
  | { ok: true; userId: string; email: string; needsConfirmation?: boolean }
  | { ok: false; message: string };

/** Register: Supabase signUp + create user profile. Does not set session if email confirmation required. */
export async function register(options: RegisterOptions): Promise<RegisterResult> {
  const supabase = createBrowserClient();
  if (!supabase) {
    return { ok: false, message: "Auth not configured" };
  }
  const { email, password, referralCode, fullName, dateOfBirth, residenceState } = options;
  const dob = dateOfBirth.trim();
  const state = residenceState.trim().toUpperCase();
  if (!dob || !isAtLeastAge(dob, 18)) {
    return { ok: false, message: "You must be 18 or older to register." };
  }
  if (!state || !isValidUsStateCode(state)) {
    return { ok: false, message: "Please select a valid US state." };
  }
  if (isStateExcludedFromParticipation(state)) {
    return { ok: false, message: "Residents of Washington state are not eligible to register." };
  }
  const trimmedName = fullName?.trim() ?? "";
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        ...(trimmedName ? { full_name: trimmedName } : {}),
        date_of_birth: dob,
        residence_state: state,
        ...(referralCode ? { referred_by_code: referralCode } : {}),
      },
    },
  });
  if (error) return { ok: false, message: error.message };
  if (!data.user) return { ok: false, message: "Signup failed" };
  try {
    await supabase.from("users").insert([{
      id: data.user.id,
      email: data.user.email ?? "",
      role: "member",
      balance: 0,
      ad_credit_balance: 0,
      created_at: new Date().toISOString(),
    }]);
  } catch {
    // Insert may fail (e.g. RLS); sync-user with service role will ensure row exists
  }
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (data.session?.access_token) {
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    const syncRes = await fetch(`${origin}/api/auth/sync-user`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: data.user.id,
        email: data.user.email,
        full_name: trimmedName || undefined,
        date_of_birth: dob,
        residence_state: state,
        referralCode: referralCode?.trim() || undefined,
      }),
    });
    if (!syncRes.ok) {
      const j = (await syncRes.json().catch(() => ({}))) as { message?: string };
      return { ok: false, message: j.message || "Could not complete registration." };
    }
  } catch {
    return { ok: false, message: "Could not complete registration. Try again." };
  }
  if (referralCode) {
    await supabase.from("users").update({ referred_by_code: referralCode }).eq("id", data.user.id);
  }
  if (data.session) {
    setSession({
      userId: data.user.id,
      email: data.user.email ?? "",
      expiresAt: data.session.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : "",
      accessToken: data.session.access_token,
    });
  }
  return {
    ok: true,
    userId: data.user.id,
    email: data.user.email ?? "",
    needsConfirmation: !data.session && !!data.user,
  };
}

/** Get current authenticated user from Supabase session. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = createBrowserClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  let role: string | undefined;
  let isSuperAdmin: boolean | undefined;
  const { data: row } = await supabase.from("users").select("role, is_super_admin").eq("id", user.id).maybeSingle();
  if (row) {
    role = (row as { role?: string }).role;
    isSuperAdmin = !!(row as { is_super_admin?: boolean }).is_super_admin;
  }
  return { id: user.id, email: user.email ?? "", role, isSuperAdmin };
}

/** Logout: sign out from Supabase and clear local session. */
export async function logout(): Promise<void> {
  const supabase = createBrowserClient();
  if (supabase) await supabase.auth.signOut();
  clearSession();
}
