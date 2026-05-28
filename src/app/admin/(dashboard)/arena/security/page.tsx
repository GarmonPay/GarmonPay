import { redirect } from "next/navigation";

/** Arena security is a tab on /admin/arena */
export default function ArenaSecurityRedirect() {
  redirect("/admin/arena?tab=security");
}
