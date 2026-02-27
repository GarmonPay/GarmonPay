import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

type AdminUserRow = {
  id: string;
  email: string | null;
  role: string | null;
  is_super_admin?: boolean | null;
};

type AccessDenied = {
  ok: false;
  response: NextResponse;
};

type AccessGranted = {
  ok: true;
  adminId: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
};

export type AdminAccessResult = AccessDenied | AccessGranted;

async function fetchAdminRow(adminId: string): Promise<{
  row: AdminUserRow | null;
  response: NextResponse | null;
}> {
  const supabase = createAdminClient();
  if (!supabase) {
    return {
      row: null,
      response: NextResponse.json({ message: "Supabase admin client not configured" }, { status: 503 }),
    };
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, email, role, is_super_admin")
    .eq("id", adminId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return {
      row: null,
      response: NextResponse.json({ message: "Failed to verify admin access" }, { status: 500 }),
    };
  }

  return { row: (data as AdminUserRow | null) ?? null, response: null };
}

export async function requireAdminAccess(request: Request): Promise<AdminAccessResult> {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) {
    return { ok: false, response: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  }

  const { row, response } = await fetchAdminRow(adminId);
  if (response) return { ok: false, response };
  if (!row) {
    return { ok: false, response: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  }

  const role = typeof row.role === "string" ? row.role : "user";
  const isSuperAdmin = !!row.is_super_admin;
  if (role !== "admin" && !isSuperAdmin) {
    return { ok: false, response: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  }

  return {
    ok: true,
    adminId: row.id,
    email: row.email ?? "",
    role,
    isSuperAdmin,
  };
}

export async function requireSuperAdminAccess(request: Request): Promise<AdminAccessResult> {
  const access = await requireAdminAccess(request);
  if (!access.ok) return access;
  if (!access.isSuperAdmin) {
    return { ok: false, response: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  }
  return access;
}
