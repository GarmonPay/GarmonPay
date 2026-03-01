"use client";

import { createBrowserClient } from "@/lib/supabase";

const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "/api";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function getAccessTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function getAdminAccessToken(): Promise<string | null> {
  const fromCookie = getAccessTokenFromCookie();
  if (fromCookie) {
    return fromCookie;
  }

  const supabase = createBrowserClient();
  if (!supabase) return null;
  const {
    data: { session }
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function adminBackendFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAdminAccessToken();
  if (!token) {
    throw new Error("Admin session expired");
  }

  const response = await fetch(`${trimTrailingSlash(API_BASE)}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof (data as { message?: unknown }).message === "string"
        ? (data as { message: string }).message
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}
