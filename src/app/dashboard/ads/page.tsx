import { redirect } from "next/navigation";

/** Legacy public.ads watch flow removed. */
export default function DashboardAdsRedirect() {
  redirect("/dashboard/earn");
}
