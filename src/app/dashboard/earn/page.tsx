"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSessionAsync } from "@/lib/session";
import { getAdsFeed, engageAd, getAdEarnings, getDashboard, getAdsStreak, getAdsLeaderboard, startAdEngagementSession } from "@/lib/api";
import { AdvertiserSocialLinks } from "@/components/ads/SocialPlatformLink";
import { Confetti } from "@/components/ads/Confetti";

const MAX_DAILY_EARNINGS = 2.0;

type FeedAd = {
  id: string;
  advertiserName: string;
  advertiserLogo: string | null;
  title: string;
  description: string | null;
  adType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  destinationUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  twitterUrl: string | null;
  facebookUrl: string | null;
  twitchUrl: string | null;
  userEarnsView: number;
  userEarnsClick: number;
  userEarnsFollow: number;
  userEarnsShare: number;
  userEarnsView15?: number;
  userEarnsView30?: number;
  userEarnsView60?: number;
};

type EngagementType = "view" | "click" | "follow" | "share" | "banner_view";

export default function EarnPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean } | null>(null);
  const [ads, setAds] = useState<FeedAd[]>([]);
  const [todayDollars, setTodayDollars] = useState(0);
  const [totalDollars, setTotalDollars] = useState(0);
  const [balanceCents, setBalanceCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const [engagedToday, setEngagedToday] = useState<Set<string>>(new Set());
  const [showConfetti, setShowConfetti] = useState(false);
  const [streakDays, setStreakDays] = useState(0);
  const [leaderboard, setLeaderboard] = useState<Array<{ user_id: string; total: number }>>([]);
  const [activeModal, setActiveModal] = useState<
    | null
    | { type: "video"; ad: FeedAd; sessionId: string }
    | { type: "banner"; ad: FeedAd; sessionId: string }
    | { type: "social"; ad: FeedAd; sessionId: string }
    | { type: "click"; ad: FeedAd; sessionId: string }
  >(null);

  const showToast = useCallback((message: string) => {
    setToast({ message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    const s = await getSessionAsync();
    if (!s) {
      router.replace("/login?next=/dashboard/earn");
      return;
    }
    const tokenOrId = s.accessToken ?? s.userId;
    const isToken = !!s.accessToken;
    setSession({ tokenOrId, isToken });
    try {
      const [feedRes, earningsRes, dashRes, streakRes, leaderRes] = await Promise.all([
        getAdsFeed(tokenOrId, isToken),
        getAdEarnings(tokenOrId, isToken),
        getDashboard(tokenOrId, isToken),
        getAdsStreak(tokenOrId, isToken).catch(() => ({ streakDays: 0 })),
        getAdsLeaderboard(tokenOrId, isToken).catch(() => ({ leaderboard: [] })),
      ]);
      setAds(feedRes?.ads ?? []);
      setTodayDollars(earningsRes?.todayDollars ?? 0);
      setTotalDollars(earningsRes?.totalDollars ?? 0);
      setBalanceCents(dashRes?.balanceCents ?? 0);
      setStreakDays(streakRes?.streakDays ?? 0);
      setLeaderboard(leaderRes?.leaderboard ?? []);
    } catch {
      setAds([]);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const handleEngage = useCallback(
    async (adId: string, engagementType: EngagementType, durationSeconds?: number, sessionId?: string) => {
      if (!session) return;
      try {
        const res = await engageAd(session.tokenOrId, session.isToken, {
          adId,
          engagementType,
          durationSeconds,
          sessionId,
        });
        setEngagedToday((prev) => new Set(prev).add(adId));
        setTodayDollars((t) => t + (res.userEarnedDollars ?? 0));
        setTotalDollars((t) => t + (res.userEarnedDollars ?? 0));
        setBalanceCents((c) => c + (res.userEarnedCents ?? 0));
        showToast(`+$${(res.userEarnedDollars ?? 0).toFixed(3)} earned! 💰`);
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
        setActiveModal(null);
        load();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not credit");
      }
    },
    [session, showToast, load]
  );

  const openModalWithSession = useCallback(
    async (type: "video" | "banner" | "social" | "click", ad: FeedAd, engagementType: EngagementType) => {
      if (!session) return;
      try {
        const s = await startAdEngagementSession(session.tokenOrId, session.isToken, { adId: ad.id, engagementType });
        setActiveModal({ type, ad, sessionId: s.sessionId });
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not start engagement");
      }
    },
    [session, showToast]
  );

  const handleSocialFollow = useCallback(
    async (ad: FeedAd, sessionId?: string) => {
      if (!session) return;
      showToast("Confirm after 5 seconds on the platform to earn.");
      setTimeout(async () => {
        try {
          await handleEngage(ad.id, "follow", undefined, sessionId);
          setActiveModal(null);
        } catch {
          // already shown in handleEngage
        }
      }, 5500);
    },
    [session, handleEngage, showToast]
  );

  if (!session && !loading) {
    return (
      <div className="card-lux p-6">
        <p className="text-fintech-muted">Redirecting to login…</p>
      </div>
    );
  }

  const dailyLimitReached = todayDollars >= MAX_DAILY_EARNINGS;
  const progressPct = Math.min(100, (todayDollars / MAX_DAILY_EARNINGS) * 100);
  const level =
    totalDollars >= 500 ? "Diamond" : totalDollars >= 200 ? "Platinum" : totalDollars >= 50 ? "Gold" : totalDollars >= 10 ? "Silver" : "Bronze";

  return (
    <div className="space-y-4 tablet:space-y-6">
      {/* Header */}
      <div className="animate-slide-up card-lux p-4 tablet:p-6">
        <h1 className="text-xl font-bold text-white mb-2">EARN</h1>
        <p className="text-fintech-muted text-sm mb-4">Get Seen. Get Known. Get Paid.</p>
        <button
          type="button"
          onClick={() => router.push("/dashboard/earn/calculator")}
          style={{
            width: "100%",
            padding: "16px",
            background: "linear-gradient(135deg, #f0a500, #ff6b00)",
            color: "#000",
            border: "none",
            borderRadius: 12,
            fontSize: 16,
            fontWeight: 900,
            cursor: "pointer",
            marginBottom: 16,
          }}
        >
          💰 Calculate Your Potential Earnings
        </button>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div>
            <p className="text-xs text-fintech-muted uppercase">Today</p>
            <p className="text-lg font-bold text-fintech-money">${todayDollars.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-fintech-muted uppercase">All time</p>
            <p className="text-lg font-bold text-fintech-money">${totalDollars.toFixed(2)}</p>
          </div>
          {balanceCents >= 2000 && (
            <Link
              href="/dashboard/withdraw"
              className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Withdraw
            </Link>
          )}
        </div>
        <div className="mt-2">
          <p className="text-xs text-fintech-muted mb-1">
            Today: ${todayDollars.toFixed(2)} / ${MAX_DAILY_EARNINGS.toFixed(2)} max
          </p>
          <div className="h-2 rounded-full bg-black/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-fintech-success transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {dailyLimitReached && (
            <p className="text-sm text-fintech-muted mt-1">Come back tomorrow!</p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-fintech-muted" title="From your lifetime ad earnings — display only; payouts use each ad’s base rate.">
            Level: <span className="text-white font-medium">{level}</span>
          </span>
          {streakDays > 0 && (
            <span
              className="text-amber-400"
              title="Consecutive days you completed an ad engagement. Does not multiply payout."
            >
              🔥 {streakDays} day streak
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-fintech-muted">
          Ad payouts use each campaign’s base rate (no level/streak multiplier), so advertiser budgets match package pricing.
        </p>
      </div>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="card-lux p-4">
          <h2 className="text-sm font-medium text-fintech-muted mb-2">Top earners this week</h2>
          <ul className="space-y-1">
            {leaderboard.slice(0, 5).map((e, i) => (
              <li key={e.user_id} className="flex justify-between text-sm">
                <span className="text-fintech-muted">#{i + 1}</span>
                <span className="text-fintech-money">${e.total.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showConfetti && <Confetti />}
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-fintech-success/95 text-white px-4 py-2 shadow-lg animate-fade-in">
          {toast.message}
        </div>
      )}

      {/* Ad Feed */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-fintech-muted">Available ads</h2>
        {loading ? (
          <div className="card-lux p-6 text-fintech-muted">Loading…</div>
        ) : ads.length === 0 ? (
          <div className="card-lux p-6 text-fintech-muted">
            No new ads right now. Check back later!
          </div>
        ) : (
          <div className="space-y-3">
            {ads.map((ad) => {
              const alreadyEarned = engagedToday.has(ad.id);
              return (
                <div key={ad.id} className="card-lux p-4 overflow-hidden">
                  <div className="flex items-start gap-3">
                    {ad.advertiserLogo ? (
                      <Image
                        src={ad.advertiserLogo}
                        alt=""
                        width={40}
                        height={40}
                        className="rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-full bg-fintech-accent/30 shrink-0 flex items-center justify-center text-lg"
                        aria-hidden
                      >
                        {ad.advertiserName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-fintech-muted">{ad.advertiserName}</p>
                      <h3 className="font-medium text-white truncate">{ad.title}</h3>
                      {ad.description && (
                        <p className="text-sm text-fintech-muted line-clamp-2 mt-0.5">
                          {ad.description}
                        </p>
                      )}
                      <AdvertiserSocialLinks
                        urls={{
                          instagram: ad.instagramUrl,
                          tiktok: ad.tiktokUrl,
                          youtube: ad.youtubeUrl,
                          twitter: ad.twitterUrl,
                          facebook: ad.facebookUrl,
                          twitch: ad.twitchUrl,
                        }}
                        userEarnsFollow={ad.userEarnsFollow}
                        onFollow={() => openModalWithSession("social", ad, "follow")}
                        disabled={alreadyEarned || dailyLimitReached}
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        {alreadyEarned ? (
                          <span className="text-sm text-fintech-muted">Already earned today</span>
                        ) : dailyLimitReached ? (
                          <span className="text-sm text-fintech-muted">Daily limit reached</span>
                        ) : ad.adType === "video" && ad.mediaUrl ? (
                          <button
                            type="button"
                            onClick={() => openModalWithSession("video", ad, "view")}
                            className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                          >
                            Watch & Earn up to ${(ad.userEarnsView60 ?? ad.userEarnsView).toFixed(3)} 🎬
                          </button>
                        ) : ad.adType === "banner" && ad.mediaUrl ? (
                          <button
                            type="button"
                            onClick={() => openModalWithSession("banner", ad, "banner_view")}
                            className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                          >
                            View & Earn ${ad.userEarnsView.toFixed(3)} 👁
                          </button>
                        ) : ad.adType === "social" ? (
                          <button
                            type="button"
                            onClick={() => openModalWithSession("social", ad, "follow")}
                            className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                          >
                            Follow & Earn ${ad.userEarnsFollow.toFixed(3)} ➕
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openModalWithSession("click", ad, "click")}
                            className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                          >
                            Visit & Earn ${ad.userEarnsClick.toFixed(3)} 🔗
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Video modal */}
      {activeModal?.type === "video" && activeModal.ad.mediaUrl && (
        <VideoAdModal
          ad={activeModal.ad}
          onComplete={(durationSeconds) => handleEngage(activeModal.ad.id, "view", durationSeconds, activeModal.sessionId)}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* Banner modal */}
      {activeModal?.type === "banner" && activeModal.ad.mediaUrl && (
        <BannerAdModal
          ad={activeModal.ad}
          onComplete={() => handleEngage(activeModal.ad.id, "banner_view", 30, activeModal.sessionId)}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* Social follow modal */}
      {activeModal?.type === "social" && (
        <SocialFollowModal
          ad={activeModal.ad}
          onConfirm={() => handleSocialFollow(activeModal.ad, activeModal.sessionId)}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* Click-through modal */}
      {activeModal?.type === "click" && (
        <ClickAdModal
          ad={activeModal.ad}
          onConfirm={() => handleEngage(activeModal.ad.id, "click", undefined, activeModal.sessionId)}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}

function videoEarnForSeconds(sec: number, ad: FeedAd): number {
  const v15 = ad.userEarnsView15 ?? 0.005;
  const v30 = ad.userEarnsView30 ?? 0.008;
  const v60 = ad.userEarnsView60 ?? 0.012;
  if (sec >= 60) return v60;
  if (sec >= 30) return v30;
  if (sec >= 15) return v15;
  return 0;
}

function VideoAdModal({
  ad,
  onComplete,
  onClose,
}: {
  ad: FeedAd;
  onComplete: (durationSeconds: number) => void;
  onClose: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const [canSkip, setCanSkip] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      setSeconds((s) => {
        if (s >= 14) setCanSkip(true);
        if (s >= 60) return 60;
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const handleComplete = () => {
    if (completed) return;
    setCompleted(true);
    onComplete(Math.min(60, Math.max(15, seconds)));
  };

  const earningSoFar = videoEarnForSeconds(seconds, ad);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
        <button
          type="button"
          onClick={onClose}
          className="text-white/80 hover:text-white text-sm"
        >
          Close
        </button>
        {canSkip && (
          <button
            type="button"
            onClick={handleComplete}
            className="rounded-lg bg-fintech-accent px-3 py-1 text-sm text-white"
          >
            Skip after 15s ✓
          </button>
        )}
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <video
          src={ad.mediaUrl!}
          className="max-h-full max-w-full object-contain"
          autoPlay
          playsInline
          muted
          onEnded={() => handleComplete()}
        />
      </div>
      <div className="p-4 bg-black/60">
        <div className="flex justify-between text-sm text-white/80 mb-2">
          <span>Progress: {seconds}s</span>
          <span className="text-fintech-success font-medium">Earned: ${earningSoFar.toFixed(3)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full bg-fintech-accent transition-all"
            style={{ width: `${Math.min(100, (seconds / 60) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function BannerAdModal({
  ad,
  onComplete,
  onClose,
}: {
  ad: FeedAd;
  onComplete: () => void;
  onClose: () => void;
}) {
  const [seconds, setSeconds] = useState(30);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (seconds <= 0) {
      if (!done) {
        setDone(true);
        onComplete();
      }
      return;
    }
    const t = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [seconds, done, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="absolute top-4 right-4 z-10">
        <button type="button" onClick={onClose} className="text-white/80 hover:text-white text-sm">
          Close
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ad.mediaUrl!}
          alt={ad.title}
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <div className="p-4 bg-black/60">
        <p className="text-sm text-white/80 mb-2">View for 30 seconds to earn ${ad.userEarnsView.toFixed(3)}</p>
        <p className="text-lg font-medium text-white">{seconds}s remaining</p>
      </div>
    </div>
  );
}

function SocialFollowModal({
  ad,
  onConfirm,
  onClose,
}: {
  ad: FeedAd;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={onClose}>
      <div
        className="card-lux p-6 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-white mb-2">Follow to earn ${ad.userEarnsFollow.toFixed(3)}</h3>
        <p className="text-sm text-fintech-muted mb-4">
          Open the platform, follow the account, and stay 5 seconds. Then confirm below.
        </p>
        <AdvertiserSocialLinks
          urls={{
            instagram: ad.instagramUrl,
            tiktok: ad.tiktokUrl,
            youtube: ad.youtubeUrl,
            twitter: ad.twitterUrl,
            facebook: ad.facebookUrl,
            twitch: ad.twitchUrl,
          }}
          userEarnsFollow={ad.userEarnsFollow}
          onFollow={() => {}}
        />
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-medium text-white"
          >
            I followed — credit me
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/20 px-4 py-2 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ClickAdModal({
  ad,
  onConfirm,
  onClose,
}: {
  ad: FeedAd;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={onClose}>
      <div
        className="card-lux p-6 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-white mb-2">Visit to earn ${ad.userEarnsClick.toFixed(3)}</h3>
        <p className="text-sm text-fintech-muted mb-4">
          Click the link below to visit the site. Then confirm to credit.
        </p>
        {ad.destinationUrl && (
          <a
            href={ad.destinationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fintech-accent underline break-all"
          >
            {ad.destinationUrl}
          </a>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-medium text-white"
          >
            I visited — credit me
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/20 px-4 py-2 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
