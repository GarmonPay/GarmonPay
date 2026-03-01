import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";
import { AdminDashboardShell } from "./AdminDashboardShell";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token =
    cookieStore.get("sb-admin-token")?.value ??
    cookieStore.get("sb-access-token")?.value;

  if (!token) {
    redirect("/admin/login");
  }

  const supabase = createServerClient(token);
  if (!supabase) {
    redirect("/admin/login");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/admin/login");
  }

  let admin = await isAdmin(user.id);
  if (!admin) {
    // Fallback for environments missing service role key: try checking current user's own row via auth token client.
    const { data: profile } = await supabase
      .from("users")
      .select("role, is_super_admin")
      .eq("id", user.id)
      .maybeSingle();
    const row = profile as { role?: string; is_super_admin?: boolean } | null;
    admin = (row?.role?.toLowerCase() === "admin") || !!row?.is_super_admin;
  }

  if (!admin) {
    redirect("/dashboard");
  }

  return <AdminDashboardShell>{children}</AdminDashboardShell>;
}
