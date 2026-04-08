import { redirect } from "next/navigation";

/** Subroutes redirect to the main Spin Wheel dashboard page. */
export default function DashboardSpinWheelCatchAll() {
  redirect("/dashboard/games/spin");
}
