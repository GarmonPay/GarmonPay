import { redirect } from "next/navigation";

/** Subroutes redirect to the main Mystery Box dashboard page. */
export default function DashboardMysteryBoxCatchAll() {
  redirect("/dashboard/games/mystery-box");
}
