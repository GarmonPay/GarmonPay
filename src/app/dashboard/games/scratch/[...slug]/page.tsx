import { redirect } from "next/navigation";

/** Subroutes redirect to the main Scratch Card dashboard page. */
export default function DashboardScratchCatchAll() {
  redirect("/dashboard/games/scratch");
}
