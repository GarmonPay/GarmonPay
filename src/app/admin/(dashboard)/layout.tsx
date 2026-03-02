import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-cookie";
import { AdminDashboardShell } from "./AdminDashboardShell";

/**
 * Admin dashboard layout. Server-side only.
 * Verifies admin: token from httpOnly cookie → auth.uid() → public.users role.
 * Uses SUPABASE_SERVICE_ROLE_KEY when set; else token-scoped read.
 */
export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!token) {
    redirect("/admin/login");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    redirect("/admin/login");
  }

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) {
    redirect("/admin/login");
  }

  const roleClient = serviceKey
    ? createClient(url, serviceKey)
    : authClient;
  const { data: profile, error: profileError } = await roleClient
    .from("users")
    .select("role, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    redirect("/admin/login");
  }
  const row = profile as { role?: string; is_super_admin?: boolean };
  const isAdmin = (row.role?.toLowerCase() === "admin") || !!row.is_super_admin;
  if (!isAdmin) {
    redirect("/admin/login");
  }

  return <AdminDashboardShell>{children}</AdminDashboardShell>;
}
