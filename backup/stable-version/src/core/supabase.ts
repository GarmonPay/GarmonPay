/*
 * CORE FILE — DO NOT MODIFY WITHOUT EXPLICIT INSTRUCTION.
 * CRITICAL FOR PLATFORM SECURITY.
 */

/**
 * Supabase client initialization. Export client safely.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Browser/client Supabase client. Returns null if env not set. */
export function createBrowserClient() {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

/** Server-side client with optional user JWT. Returns null if env not set. */
export function createServerClient(accessToken?: string) {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    ...(accessToken && {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }),
  });
}

/** Server-side admin client (bypasses RLS). Returns null if not configured. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
