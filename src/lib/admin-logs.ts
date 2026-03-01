import { createAdminClient } from "@/lib/supabase";

interface AdminLogInput {
  adminId: string;
  action: string;
  targetUserId?: string | null;
  amountCents?: number | null;
  metadata?: Record<string, unknown>;
}

/**
 * Best-effort admin audit logging.
 * Supports both the legacy minimal admin_logs schema and the extended schema.
 */
export async function logAdminAction(input: AdminLogInput): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase) return;
  if (!input.adminId || !input.action) return;

  const row = {
    admin_id: input.adminId,
    action: input.action,
    target_user_id: input.targetUserId ?? null,
    amount_cents: input.amountCents ?? null,
    metadata: input.metadata ?? {},
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("admin_logs").insert(row);
  if (!error) return;

  // Fallback for older schema that only has action/admin_id/created_at.
  const { error: fallbackError } = await supabase.from("admin_logs").insert({
    admin_id: input.adminId,
    action: input.action,
    created_at: new Date().toISOString(),
  });

  if (fallbackError) {
    console.warn("admin_logs insert failed:", fallbackError.message);
  }
}
