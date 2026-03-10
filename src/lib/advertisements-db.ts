/**
 * Advertisements table: display ads (banner/video) with placement and impression/click tracking.
 */

import { createAdminClient } from "@/lib/supabase";

export type AdPlacement = "homepage" | "dashboard" | "fight_arena";
export type AdTypeDb = "banner" | "video";

export interface AdvertisementRow {
  id: string;
  title: string;
  description: string;
  ad_type: AdTypeDb;
  file_url: string | null;
  target_url: string | null;
  placement: AdPlacement;
  active: boolean;
  impressions: number;
  clicks: number;
  created_at: string;
}

function supabase() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

/** List active advertisements by placement (for public display). */
export async function listActiveByPlacement(placement: AdPlacement): Promise<AdvertisementRow[]> {
  const { data, error } = await supabase()
    .from("advertisements")
    .select("*")
    .eq("placement", placement)
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdvertisementRow[];
}

/** List all advertisements (admin). */
export async function listAllAdvertisements(): Promise<AdvertisementRow[]> {
  const { data, error } = await supabase()
    .from("advertisements")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdvertisementRow[];
}

/** Get one by id. */
export async function getAdvertisementById(id: string): Promise<AdvertisementRow | null> {
  const { data, error } = await supabase()
    .from("advertisements")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as AdvertisementRow | null;
}

/** Increment impressions by 1. */
export async function incrementImpressions(id: string): Promise<void> {
  const { data: row, error: fetchErr } = await supabase()
    .from("advertisements")
    .select("impressions")
    .eq("id", id)
    .single();
  if (fetchErr || row == null) throw fetchErr || new Error("Ad not found");
  const current = (row as { impressions: number }).impressions ?? 0;
  const { error } = await supabase()
    .from("advertisements")
    .update({ impressions: current + 1 })
    .eq("id", id);
  if (error) throw error;
}

/** Increment clicks by 1. */
export async function incrementClicks(id: string): Promise<void> {
  const { data: row, error: fetchErr } = await supabase()
    .from("advertisements")
    .select("clicks")
    .eq("id", id)
    .single();
  if (fetchErr || row == null) throw fetchErr || new Error("Ad not found");
  const current = (row as { clicks: number }).clicks ?? 0;
  const { error } = await supabase()
    .from("advertisements")
    .update({ clicks: current + 1 })
    .eq("id", id);
  if (error) throw error;
}

/** Create advertisement (admin). */
export async function createAdvertisement(params: {
  title: string;
  description?: string;
  ad_type: AdTypeDb;
  file_url?: string | null;
  target_url?: string | null;
  placement: AdPlacement;
  active?: boolean;
}): Promise<AdvertisementRow> {
  const { data, error } = await supabase()
    .from("advertisements")
    .insert({
      title: params.title,
      description: params.description ?? "",
      ad_type: params.ad_type,
      file_url: params.file_url ?? null,
      target_url: params.target_url ?? null,
      placement: params.placement,
      active: params.active ?? true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AdvertisementRow;
}

/** Update advertisement (admin). */
export async function updateAdvertisement(
  id: string,
  updates: Partial<{
    title: string;
    description: string;
    ad_type: AdTypeDb;
    file_url: string | null;
    target_url: string | null;
    placement: AdPlacement;
    active: boolean;
  }>
): Promise<AdvertisementRow> {
  const { data, error } = await supabase()
    .from("advertisements")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as AdvertisementRow;
}

/** Delete advertisement (admin). */
export async function deleteAdvertisement(id: string): Promise<void> {
  const { error } = await supabase().from("advertisements").delete().eq("id", id);
  if (error) throw error;
}
</think>
Using a simple SQL increment instead of RPC:
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
StrReplace