import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminDashboardShell } from "./AdminDashboardShell";

function resolveOrigin(headerStore: { get(name: string): string | null }): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit && explicit.startsWith("http")) {
    return explicit.replace(/\/$/, "");
  }
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "https";
  if (!host) {
    return "http://localhost:3000";
  }
  return `${proto}://${host}`;
}

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const token = cookieStore.get("sb-access-token")?.value;

  if (!token) {
    redirect("/admin/login");
  }

  const origin = resolveOrigin(headerStore);

  let verifyRes: Response | null = null;
  try {
    verifyRes = await fetch(`${origin}/api/admin/verify`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    redirect("/admin/login");
  }

  if (!verifyRes) {
    redirect("/admin/login");
  }

  if (verifyRes.status === 401) {
    redirect("/admin/login");
  }

  const verifyData = (await verifyRes.json().catch(() => ({}))) as { isAdmin?: boolean };

  if (!verifyData.isAdmin) {
    redirect("/dashboard");
  }

  return <AdminDashboardShell>{children}</AdminDashboardShell>;
}
