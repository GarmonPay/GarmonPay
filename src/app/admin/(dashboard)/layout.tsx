import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-cookie";
import { AdminDashboardShell } from "./AdminDashboardShell";

/**
 * Admin dashboard layout: verify admin via SERVICE ROLE only.
 * Token from httpOnly cookie → get user id from Auth → select role from public.users where id = user.id
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

  // 1) Resolve auth.uid() from token
  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) {
    redirect("/admin/login");
  }

  // 2) Must use SERVICE ROLE to check public.users (RLS-safe)
  if (!serviceKey) {
    redirect("/admin/login");
  }
  const adminClient = createClient(url, serviceKey);
  const { data: profile, error: profileError } = await adminClient
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
