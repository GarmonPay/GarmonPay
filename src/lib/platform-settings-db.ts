import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * platform_settings is a single-row table. Production uses bigint id (e.g. 1); older schemas used text 'default'.
 * Resolve the actual PK for updates; use limit(1).maybeSingle() for reads when only one row exists.
 */
export async function platformSettingsRowId(supabase: SupabaseClient): Promise<string | number | null> {
  const { data, error } = await supabase.from("platform_settings").select("id").limit(1).maybeSingle();
  if (error || !data) return null;
  const id = (data as { id?: unknown }).id;
  if (id === undefined || id === null) return null;
  return id as string | number;
}
