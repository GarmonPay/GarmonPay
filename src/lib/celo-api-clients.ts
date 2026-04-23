import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServerClient as createJwtClient } from "@/lib/supabase";

export type CeloAuthContext = {
  user: User;
  adminClient: SupabaseClient;
};

/**
 * Session client (user JWT) + admin client (RLS bypass) for C-Lo API routes.
 */
export async function getCeloApiClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return null;
  }
  const cookieStore = await cookies();
  const sessionClient = createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          /* set may fail in server components */
        }
      },
    },
  });
  const adminClient = createClient(url, service);
  return { sessionClient, adminClient };
}

/**
 * Cookie session first (SSR), then `Authorization: Bearer` (required on some mobile / storage paths).
 */
export async function getCeloAuth(
  request: Request,
  clients: NonNullable<Awaited<ReturnType<typeof getCeloApiClients>>>
): Promise<CeloAuthContext | null> {
  const { data: { user: fromCookies } } = await clients.sessionClient.auth.getUser();
  if (fromCookies) {
    if (process.env.NODE_ENV === "development") {
      console.log("[C-Lo API] authed (cookies)", fromCookies.id);
    }
    return { user: fromCookies, adminClient: clients.adminClient };
  }
  const raw = request.headers.get("authorization");
  const token = raw?.match(/^Bearer\s+(\S+)/i)?.[1]?.trim() ?? null;
  if (!token) {
    if (process.env.NODE_ENV === "development") {
      console.log("[C-Lo API] no user (no cookie session, no Bearer token)");
    }
    return null;
  }
  const withJwt = createJwtClient(token);
  if (!withJwt) return null;
  const { data: { user: fromBearer } } = await withJwt.auth.getUser();
  if (!fromBearer) {
    if (process.env.NODE_ENV === "development") {
      console.log("[C-Lo API] Bearer did not resolve to a user");
    }
    return null;
  }
  if (process.env.NODE_ENV === "development") {
    console.log("[C-Lo API] authed (Bearer)", fromBearer.id);
  }
  return { user: fromBearer, adminClient: clients.adminClient };
}
