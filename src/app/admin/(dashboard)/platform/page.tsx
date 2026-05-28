import { redirect } from "next/navigation";

/** Merged into Platform Config */
export default function AdminPlatformRedirect() {
  redirect("/admin/config");
}
