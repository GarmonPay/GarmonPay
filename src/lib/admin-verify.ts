import { createAdminClient, createServerClient } from "@/lib/supabase";

export interface AdminVerificationResult {
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  userId: string | null;
  email: string | null;
}

/**
 * Verify Bearer token -> Supabase auth user -> public.users admin role.
 * Admin is role='admin' OR is_super_admin=true.
 */
export async function verifyAdminAccess(accessToken: string | null): Promise<AdminVerificationResult> {
  if (!accessToken) {
    return {
      isAuthenticated: false,
      isAdmin: false,
      isSuperAdmin: false,
      userId: null,
      email: null,
    };
  }

  const userClient = createServerClient(accessToken);
  if (!userClient) {
    return {
      isAuthenticated: false,
      isAdmin: false,
      isSuperAdmin: false,
      userId: null,
      email: null,
    };
  }

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return {
      isAuthenticated: false,
      isAdmin: false,
      isSuperAdmin: false,
      userId: null,
      email: null,
    };
  }

  const adminClient = createAdminClient();
  const profileClient = adminClient ?? userClient;

  const { data: profile, error: profileError } = await profileClient
    .from("users")
    .select("role, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      isAuthenticated: true,
      isAdmin: false,
      isSuperAdmin: false,
      userId: user.id,
      email: user.email ?? null,
    };
  }

  const row = profile as { role?: string; is_super_admin?: boolean };
  const isSuperAdmin = !!row.is_super_admin;
  const isAdmin = row.role?.toLowerCase() === "admin" || isSuperAdmin;

  return {
    isAuthenticated: true,
    isAdmin,
    isSuperAdmin,
    userId: user.id,
    email: user.email ?? null,
  };
}
