import { createAdminClient } from "@/lib/supabase";

export type GarmonNotificationType =
  | "ad_earned"
  | "ad_approved"
  | "ad_budget_low"
  | "ad_budget_out"
  | "ad_milestone_views"
  | "ad_followers";

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
