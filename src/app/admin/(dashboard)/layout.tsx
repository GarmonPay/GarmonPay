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
  const token = cookieStore.get("sb-access-token")?.value;

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

  const admin = await isAdmin(user.id);
  if (!admin) {
    redirect("/dashboard");
  }

  return <AdminDashboardShell>{children}</AdminDashboardShell>;
}
