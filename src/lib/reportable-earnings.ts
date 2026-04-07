import { createAdminClient } from "@/lib/supabase";
import { IRS_REPORTABLE_PAYOUT_THRESHOLD_CENTS } from "@/lib/signup-compliance";

/** True when cumulative reportable payouts meet IRS-style threshold and user has not certified tax info. */
export function computeTaxInfoRequired(
  reportableEarningsCents: number,
  taxInfoSubmittedAt: string | null | undefined,
): boolean {
  const total = Number(reportableEarningsCents) || 0;
  if (total < IRS_REPORTABLE_PAYOUT_THRESHOLD_CENTS) return false;
  return !taxInfoSubmittedAt;
}

/**
 * Add to profiles.reportable_earnings_cents (DB RPC). Used when user receives a paid withdrawal or similar payout.
 * Idempotent callers should ensure payout events are only recorded once (e.g. only on status = paid).
 */
export async function incrementReportableEarningsCents(
  userId: string,
  deltaCents: number,
): Promise<number | null> {
  const rounded = Math.round(deltaCents);
  if (!userId || rounded <= 0) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.rpc("increment_profile_reportable_earnings", {
    p_user_id: userId,
    p_delta_cents: rounded,
  });
  if (error) {
    console.error("[reportable-earnings] increment_profile_reportable_earnings:", error);
    return null;
  }
  const n = typeof data === "number" ? data : Number(data);
  return Number.isFinite(n) ? n : null;
}
