/**
 * GarmonPay — Ad system types.
 * Rewards issued ONLY from backend. Never trust frontend for rewards.
 */

export type AdType = "video" | "image" | "text" | "website_visit" | "app_download";

export interface Ad {
  id: string;
  title: string;
  adType: AdType;
  rewardCents: number;
  requiredSeconds: number;
  /** Video URL (for video ads). */
  videoUrl?: string;
  /** Image URL (for image ads). */
  imageUrl?: string;
  /** Text content (for text ads). */
  textContent?: string;
  /** Target URL (for website_visit or app_download). */
  targetUrl?: string;
  active: boolean;
  createdAt: string;
}

export interface AdSessionRecord {
  id: string;
  userId: string;
  adId: string;
  startedAt: string;
  expiresAt: string;
  completed: boolean;
  rewardIssued: boolean;
}
