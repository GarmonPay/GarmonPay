import { supabase } from "./supabaseClient";

export async function getLeaderboard(): Promise<
  { id: string; email: string; total_earnings?: number; total_referrals?: number }[]
> {
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase
    .from("users")
    .select("id, email, total_earnings, total_referrals")
    .order("total_earnings", { ascending: false, nullsFirst: false })
    .limit(10);

  if (error) {
    console.error("getLeaderboard error:", error);
    return [];
  }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    email: String(r.email ?? ""),
    total_earnings: typeof r.total_earnings === "number" ? r.total_earnings : 0,
    total_referrals: typeof r.total_referrals === "number" ? r.total_referrals : 0,
  }));
}
