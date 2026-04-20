import { createAdminClient } from "@/lib/supabase";

export type GarmonNotificationType =
  | "ad_earned"
  | "ad_approved"
  | "ad_rejected"
  | "ad_payment_received"
  | "ad_budget_low"
  | "ad_budget_out"
  | "ad_milestone_views"
  | "ad_followers"
  | "membership_renewed_balance"
  | "membership_expiring_soon"
  | "membership_expired"
  | "membership_renew_failed"
  | "membership_gpc_upgrade"
  | "membership_gpc_monthly";

export async function createGarmonNotification(
  userId: string,
  type: GarmonNotificationType,
  title: string,
  body?: string | null
): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase) return;
  await supabase.from("garmon_notifications").insert({
    user_id: userId,
    type,
    title,
    body: body ?? null,
  });
}
