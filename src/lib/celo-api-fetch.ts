import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Calls a same-origin C-Lo API route with `credentials: include` and, when
 * `supabase.auth.getSession()` has an `access_token`, the `Authorization` header.
 * Use for mobile Safari and other clients where the cookie session is missing
 * or partitioned but the in-memory session still has a JWT.
 */
export async function fetchCeloApi(
  supabase: SupabaseClient,
  input: string,
  init: RequestInit
): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const h = new Headers(init.headers);
  if (init.body && !h.has("Content-Type")) {
    h.set("Content-Type", "application/json");
  }
  if (session?.access_token) {
    h.set("Authorization", `Bearer ${session.access_token}`);
  }
  return fetch(input, { ...init, headers: h, credentials: "include" });
}

export function alertCeloUnauthorized() {
  alert("Session expired. Please log in again.");
}
