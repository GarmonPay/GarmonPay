/**
 * C-Lo API helpers: auth, Supabase admin, membership tier for bet caps.
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient, createServerClient as createTokenSupabaseClient } from "@/lib/supabase";
import { normalizeUserMembershipTier } from "@/lib/garmon-plan-config";
import { getTierBetLimitCents } from "@/lib/celo-engine";

export async function getCeloUserId(request: Request): Promise<string | null> {
  const cookieStore = await cookies();
  const supabaseSsr = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    }
  );
  const {
    data: { user: ssrUser },
  } = await supabaseSsr.auth.getUser();
  if (ssrUser) return ssrUser.id;

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (bearerToken) {
    const tokenClient = createTokenSupabaseClient(bearerToken);
    if (tokenClient) {
      const {
        data: { user: tokenUser },
      } = await tokenClient.auth.getUser();
      if (tokenUser) return tokenUser.id;
    }
  }
  return null;
}

export async function getUserTierBetLimitCents(userId: string): Promise<number> {
  const supabase = createAdminClient();
  if (!supabase) return getTierBetLimitCents("free");
  const { data } = await supabase.from("users").select("membership").eq("id", userId).maybeSingle();
  const tier = normalizeUserMembershipTier((data as { membership?: string } | null)?.membership);
  return getTierBetLimitCents(tier);
}

export function admin() {
  const c = createAdminClient();
  if (!c) throw new Error("Supabase admin not configured");
  return c;
}
