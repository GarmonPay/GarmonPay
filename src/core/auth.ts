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
    return { ok: false, message: "Auth not configured" };
  }
  const trimmedEmail = email.trim();
  if (!trimmedEmail) return { ok: false, message: "Email is required" };
  if (!password) return { ok: false, message: "Password is required" };
  const { data, error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
  if (error) return { ok: false, message: error.message };
  if (!data.session?.user) return { ok: false, message: "No session" };
  const uid = data.user.id;
  let role = "member";
  let isSuperAdmin = false;
  const { data: row } = await supabase.from("users").select("role, is_super_admin").eq("id", uid).maybeSingle();
  if (row && (row as { role?: string }).role) role = (row as { role: string }).role;
  if (row) isSuperAdmin = !!(row as { is_super_admin?: boolean }).is_super_admin;
  const user: AuthUser = { id: data.user.id, email: data.user.email ?? "", role, isSuperAdmin };
  const isAdmin = role === "admin" || isSuperAdmin;
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
  const { email, password, referralCode } = options;
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: referralCode ? { data: { referred_by_code: referralCode } } : undefined,
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
    const accessToken = data.session?.access_token;
    if (accessToken) {
      await fetch(`${typeof window !== "undefined" ? window.location.origin : ""}/api/auth/sync-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id: data.user.id, email: data.user.email }),
      });
    }
  } catch {
    // Best-effort sync
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
