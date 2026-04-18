import { redirect } from "next/navigation";

/** USD cash-out flow removed; balances are GC / GPC / $GPAY. */
export default function DashboardWithdrawRedirectPage() {
  redirect("/dashboard/wallet");
}
