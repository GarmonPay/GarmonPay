import { redirect } from "next/navigation";

/** Subroutes redirect to the main Pinball dashboard page. */
export default function DashboardPinballCatchAll() {
  redirect("/dashboard/games/pinball");
}
