/**
 * Supabase client for backend connection.
 * Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * When not set, returns null so app works without Supabase.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getSupabaseClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

/** Server-side: use service role for admin operations. Returns null if not configured. */
export function getSupabaseAdmin(): SupabaseClient | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) return null;
  return createClient(baseUrl, key);
}
