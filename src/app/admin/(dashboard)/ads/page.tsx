import { redirect } from "next/navigation";

/** Legacy route — marketing placements live at /admin/marketing-ads */
export default function AdminAdsRedirect() {
  redirect("/admin/marketing-ads");
}
