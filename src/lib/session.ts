/**
 * Session handling. Uses Supabase Auth when configured; otherwise fallback for dev.
 */

import { createBrowserClient } from "./supabase";

const FALLBACK_KEY = "garmonpay_session";

export interface ClientSession {
  userId: string;
  email: string;
  expiresAt: string;
  accessToken?: string;
}

/** Async: use with Supabase. Resolves to session or null. */
export async function getSessionAsync(): Promise<ClientSession | null> {
  if (typeof window === "undefined") return null;
  const supabase = createBrowserClient();
  if (supabase) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        return {
          userId: session.user.id,
          email: session.user.email ?? "",
          expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : "",
          accessToken: session.access_token,
        };
      }
      return null;
    } catch (err) {
      console.error("Supabase getSession failed", err);
      return null;
    }
  }
  return getSession();
}

/** Sync: fallback only (in-memory session). Use getSessionAsync() when using Supabase. */
export function getSession(): ClientSession | null {
  if (typeof window === "undefined") return null;
  const supabase = createBrowserClient();
  if (supabase) return null;
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as ClientSession;
    if (new Date(data.expiresAt) <= new Date()) {
      clearSession();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function setSession(session: ClientSession): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(FALLBACK_KEY);
  } catch {
    // ignore
  }
}
