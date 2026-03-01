import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { env } from "../config/env";
import { HttpError } from "../lib/http-error";

const serviceClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

export function getServiceClient() {
  return serviceClient;
}

export function getUserClient(accessToken: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

export async function getAuthenticatedUser(accessToken: string): Promise<User> {
  const client = getUserClient(accessToken);
  const {
    data: { user },
    error
  } = await client.auth.getUser();

  if (error || !user) {
    throw new HttpError(401, "Unauthorized");
  }

  return user;
}

export async function getUserRole(userId: string): Promise<{ role: string; isSuperAdmin: boolean }> {
  const { data, error } = await serviceClient
    .from("users")
    .select("role,is_super_admin")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new HttpError(403, "Forbidden");
  }

  const role = String((data as { role?: string }).role ?? "user").toLowerCase();
  const isSuperAdmin = Boolean((data as { is_super_admin?: boolean }).is_super_admin);
  return { role, isSuperAdmin };
}
