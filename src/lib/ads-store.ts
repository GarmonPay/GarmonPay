/**
 * Ads and ad sessions store. Backend only — rewards issued here, never from frontend.
 * Production: replace with Supabase tables (ads, ad_sessions, ad_rewards).
 */

import type { Ad, AdSessionRecord, AdType } from "@/types/ads";

const ads = new Map<string, Ad>();
const sessions = new Map<string, AdSessionRecord>();

/** Seed sample ads for development only. Never runs in production — admin and dashboard use real Supabase data only. */
function seedSampleAds(): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;
  if (ads.size > 0) return;
  createAd({
    title: "Welcome to GarmonPay",
    adType: "video",
    rewardCents: 50,
    requiredSeconds: 10,
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  });
  createAd({
    title: "Partner Offer",
    adType: "image",
    rewardCents: 25,
    requiredSeconds: 5,
    imageUrl: "https://placehold.co/600x400/1e3a5f/fff?text=Ad",
  });
  createAd({
    title: "Quick Read",
    adType: "text",
    rewardCents: 10,
    requiredSeconds: 5,
    textContent: "Read this message to earn rewards.",
  });
}
seedSampleAds();

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** List all active ads (for members). */
export function listAds(): Ad[] {
  return Array.from(ads.values()).filter((a) => a.active);
}

/** List all ads including inactive (admin only). */
export function listAllAds(): Ad[] {
  return Array.from(ads.values());
}

/** Get single ad. */
export function getAdById(id: string): Ad | undefined {
  return ads.get(id);
}

/** Create ad (admin). */
export function createAd(data: {
  title: string;
  adType: AdType;
  rewardCents: number;
  requiredSeconds: number;
  videoUrl?: string;
  imageUrl?: string;
  textContent?: string;
  targetUrl?: string;
}): Ad {
  const ad: Ad = {
    id: generateId("ad"),
    title: data.title,
    adType: data.adType,
    rewardCents: data.rewardCents,
    requiredSeconds: data.requiredSeconds,
    videoUrl: data.videoUrl,
    imageUrl: data.imageUrl,
    textContent: data.textContent,
    targetUrl: data.targetUrl,
    active: true,
    createdAt: new Date().toISOString(),
  };
  ads.set(ad.id, ad);
  return ad;
}

/** Start ad session. Returns session or null. */
export function startAdSession(userId: string, adId: string): AdSessionRecord | null {
  const ad = ads.get(adId);
  if (!ad || !ad.active) return null;
  const now = Date.now();
  const session: AdSessionRecord = {
    id: generateId("sess"),
    userId,
    adId,
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ad.requiredSeconds * 1000).toISOString(),
    completed: false,
    rewardIssued: false,
  };
  sessions.set(session.id, session);
  return session;
}

/** Get session by id. */
export function getSessionById(sessionId: string): AdSessionRecord | undefined {
  return sessions.get(sessionId);
}

/**
 * Complete ad session and issue reward — BACKEND ONLY.
 * Verifies: session exists, belongs to user, timer has elapsed, reward not already issued.
 * Returns { success, rewardCents } or error.
 */
export function completeAdSessionAndIssueReward(
  userId: string,
  sessionId: string
): { success: true; rewardCents: number } | { success: false; message: string } {
  const session = sessions.get(sessionId);
  if (!session) return { success: false, message: "Invalid session" };
  if (session.userId !== userId) return { success: false, message: "Unauthorized" };
  if (session.rewardIssued) return { success: false, message: "Reward already issued" };
  const now = new Date();
  const expiresAt = new Date(session.expiresAt);
  if (now < expiresAt) return { success: false, message: "Timer not complete" };
  const ad = ads.get(session.adId);
  if (!ad) return { success: false, message: "Ad not found" };

  session.completed = true;
  session.rewardIssued = true;
  return { success: true, rewardCents: ad.rewardCents };
}
