/**
 * Banners: rotator, user banners, analytics. All DB access server-side.
 */

import { createAdminClient } from "@/lib/supabase";

function supabase() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

export interface BannerRow {
  id: string;
  owner_user_id: string | null;
  title: string;
  image_url: string;
  target_url: string;
  type: string;
  status: string;
  impressions: number;
  clicks: number;
  created_at: string;
  updated_at: string;
}

/** List banners for rotator (active only). */
export async function listActiveBanners(): Promise<BannerRow[]> {
  const { data, error } = await supabase()
    .from("banners")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BannerRow[];
}

/** Record impression (increment). */
export async function recordBannerImpression(bannerId: string): Promise<void> {
  const { data } = await supabase().from("banners").select("impressions").eq("id", bannerId).single();
  const current = Number((data as { impressions?: number })?.impressions ?? 0);
  await supabase().from("banners").update({ impressions: current + 1, updated_at: new Date().toISOString() }).eq("id", bannerId);
}

/** Record click and return target_url. */
export async function recordBannerClick(bannerId: string): Promise<{ target_url: string } | null> {
  const { data: row } = await supabase().from("banners").select("target_url, clicks").eq("id", bannerId).single();
  if (!row) return null;
  const targetUrl = (row as { target_url: string }).target_url;
  const clicks = Number((row as { clicks: number }).clicks ?? 0);
  await supabase().from("banners").update({ clicks: clicks + 1, updated_at: new Date().toISOString() }).eq("id", bannerId);
  return { target_url: targetUrl };
}

/** List banners owned by user. */
export async function listBannersByOwner(userId: string): Promise<BannerRow[]> {
  const { data, error } = await supabase()
    .from("banners")
    .select("*")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BannerRow[];
}

/** Create banner (user upload). */
export async function createBanner(params: {
  owner_user_id: string;
  title: string;
  image_url: string;
  target_url: string;
  type: "advertiser" | "referral" | "admin";
}): Promise<BannerRow> {
  const { data, error } = await supabase()
    .from("banners")
    .insert({
      owner_user_id: params.owner_user_id,
      title: params.title,
      image_url: params.image_url,
      target_url: params.target_url,
      type: params.type,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data as BannerRow;
}

/** Admin: list all banners. */
export async function listAllBanners(): Promise<BannerRow[]> {
  const { data, error } = await supabase().from("banners").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BannerRow[];
}

/** Admin: update banner status (approve, pause, etc.). */
export async function updateBannerStatus(bannerId: string, status: "pending" | "active" | "paused"): Promise<void> {
  const { error } = await supabase().from("banners").update({ status, updated_at: new Date().toISOString() }).eq("id", bannerId);
  if (error) throw error;
}

/** Admin: delete banner. */
export async function deleteBanner(bannerId: string): Promise<void> {
  const { error } = await supabase().from("banners").delete().eq("id", bannerId);
  if (error) throw error;
}

/** Get banner by id (for embed/display). */
export async function getBannerById(bannerId: string): Promise<BannerRow | null> {
  const { data, error } = await supabase().from("banners").select("*").eq("id", bannerId).maybeSingle();
  if (error) throw error;
  return data as BannerRow | null;
}
