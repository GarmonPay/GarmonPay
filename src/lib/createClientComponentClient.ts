import { createBrowserClient } from "@supabase/auth-helpers-nextjs";

/**
 * Drop-in for the legacy `createClientComponentClient` name from older Supabase Next.js docs.
 * `@supabase/auth-helpers-nextjs` v0.15+ only exports `createBrowserClient(url, key)` — import this from `@/lib/createClientComponentClient` in app code.
 */
export function createClientComponentClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
  }
  return createBrowserClient(url, key);
}
