import { redirect } from "next/navigation";

/** Social tasks retired — video moderation lives at /admin/videos. */
export default function AdminSocialTasksRedirect() {
  redirect("/admin/videos");
}
