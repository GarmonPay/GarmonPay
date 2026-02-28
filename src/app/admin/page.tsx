import { redirect } from "next/navigation";

/** /admin redirects to the dashboard so the sidebar layout always applies. */
export default function AdminPage() {
  redirect("/admin/dashboard");
}
