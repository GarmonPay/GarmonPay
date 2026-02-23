/**
 * Map DB ad rows to API/frontend shape.
 */

import type { AdRow } from "./ads-db";

export type AdApiShape = {
  id: string;
  title: string;
  description?: string;
  adType: string;
  rewardCents: number;
  requiredSeconds: number;
  videoUrl?: string;
  imageUrl?: string;
  textContent?: string;
  targetUrl?: string;
  active: boolean;
  createdAt: string;
  advertiser_price?: number;
  user_reward?: number;
  profit_amount?: number;
};

/** Map DB type (video|image|text|link) to frontend adType and media fields. */
export function adRowToApi(row: AdRow): AdApiShape {
  const active = row.status === "active";
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    adType: row.type === "link" ? "website_visit" : row.type,
    rewardCents: Number(row.user_reward),
    requiredSeconds: row.duration_seconds,
    videoUrl: row.type === "video" ? (row.media_url ?? undefined) : undefined,
    imageUrl: row.type === "image" ? (row.media_url ?? undefined) : undefined,
    textContent: row.type === "text" ? (row.description ?? undefined) : undefined,
    targetUrl: row.type === "link" ? (row.media_url ?? undefined) : undefined,
    active,
    createdAt: row.created_at,
    advertiser_price: Number(row.advertiser_price),
    user_reward: Number(row.user_reward),
    profit_amount: Number(row.profit_amount),
  };
}
