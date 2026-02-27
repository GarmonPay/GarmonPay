import { createAdminClient, createServerClient } from "@/lib/supabase";

export interface AdminAuthContext {
  userId: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
  accessToken: string;
}

export type AdminAuthResult =
  | { ok: true; context: AdminAuthContext }
  | { ok: false; status: number; message: string };

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

async function resolveAdminContext(accessToken: string): Promise<AdminAuthResult> {
  const server = createServerClient(accessToken);
  if (!server) {
    return { ok: false, status: 503, message: "Auth service unavailable" };
  }

  const {
    data: { user },
    error: authError,
  } = await server.auth.getUser();
  if (authError || !user) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, status: 503, message: "Database unavailable" };
  }

  const { data: row, error: userError } = await admin
    .from("users")
    .select("email, role, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (userError || !row) {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  const role = String((row as { role?: string }).role ?? "member");
  const isSuperAdmin = Boolean((row as { is_super_admin?: boolean }).is_super_admin);
  if (role !== "admin" && !isSuperAdmin) {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  return {
    ok: true,
    context: {
      userId: user.id,
      email: String((row as { email?: string }).email ?? user.email ?? ""),
      role,
      isSuperAdmin,
      accessToken,
    },
  };
}

export async function authenticateAdminRequest(request: Request): Promise<AdminAuthResult> {
  const token = getBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  return resolveAdminContext(token);
}

export async function authenticateSuperAdminRequest(request: Request): Promise<AdminAuthResult> {
  const base = await authenticateAdminRequest(request);
  if (!base.ok) return base;
  if (!base.context.isSuperAdmin) {
    return { ok: false, status: 403, message: "Forbidden" };
  }
  return base;
}
