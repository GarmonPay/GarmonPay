import { cookies } from "next/headers";
import { createServerClient as createSsrClient } from "@supabase/ssr";
import { createServerClient, createAdminClient } from "./supabase";

async function isUserBanned(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return true;
  try {
    const { data, error } = await admin.from("users").select("banned").eq("id", userId).maybeSingle();
    // A missing profile or failed policy lookup must never bypass an account restriction.
    return !!error || !data || (data as { banned?: boolean }).banned !== false;
  } catch {
    return true;
  }
}

/** Identity comes only from Supabase-verified cookies or tokens. */
export async function getAuthUserId(request: Request): Promise<string | null> {
  return getAuthUserIdBearerOrCookie(request);
}

/**
 * Get authenticated user id from request using ONLY Bearer token (no x-user-id).
 * Use for sensitive operations (payments, balance changes) to prevent header spoofing.
 * Returns null if user is banned.
 */
export async function getAuthUserIdStrict(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!bearerToken) return null;
  const supabase = createServerClient(bearerToken);
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser(bearerToken);
  const user = data?.user ?? null;
  if (error || !user) return null;
  if (await isUserBanned(user.id)) return null;
  return user.id;
}

/**
 * Supabase cookie session first, then Bearer JWT — no x-user-id (prevents spoofing).
 * Cookie-first avoids 401 when the browser still has a valid session but the client
 * sends a stale Authorization header. Clients without cookies (e.g. some native flows)
 * can still authenticate with Bearer.
 */
export async function getAuthUserIdBearerOrCookie(request: Request): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    try {
      const cookieStore = await cookies();
      const supabaseSsr = createSsrClient(url, anon, {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      });
      const {
        data: { user: cookieUser },
        error: cookieError,
      } = await supabaseSsr.auth.getUser();
      if (!cookieError && cookieUser?.id) {
        if (await isUserBanned(cookieUser.id)) return null;
        return cookieUser.id;
      }
    } catch {
      // not in request context
    }
  }

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (bearerToken) {
    const supabase = createServerClient(bearerToken);
    if (supabase) {
      const { data, error } = await supabase.auth.getUser(bearerToken);
      const user = data?.user ?? null;
      if (!error && user?.id) {
        if (await isUserBanned(user.id)) return null;
        return user.id;
      }
    }
  }

  return null;
}
