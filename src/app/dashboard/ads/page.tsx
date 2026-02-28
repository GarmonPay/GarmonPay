"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSessionAsync } from "@/lib/session";
import { getAds, startAdSession, completeAdSession } from "@/lib/api";
import { AdViewerModal } from "@/components/ads/AdViewerModal";
import { BannerRotator } from "@/components/banners/BannerRotator";

type AdItem = {
  id: string;
  title: string;
  adType: string;
  rewardCents: number;
  requiredSeconds: number;
  videoUrl?: string;
  imageUrl?: string;
  textContent?: string;
  targetUrl?: string;
};

const AD_TYPE_LABELS: Record<string, string> = {
  video: "Video",
  image: "Image",
  text: "Text",
  website_visit: "Website Visit",
  app_download: "App Download",
};

function formatReward(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function DashboardAdsPage() {
  const router = useRouter();
  const [adsList, setAdsList] = useState<AdItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean } | null>(null);
  const [viewer, setViewer] = useState<{ ad: AdItem; sessionId: string } | null>(null);
  const [rewardMessage, setRewardMessage] = useState<string | null>(null);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/ads");
        return;
      }
      setSession({
        tokenOrId: s.accessToken ?? s.userId,
        isToken: !!s.accessToken,
      });
      getAds(s.accessToken ?? s.userId, !!s.accessToken)
        .then((r) => {
          setAdsList(r?.ads ?? []);
          setError(null);
        })
        .catch(() => {
          setAdsList([]);
          setError("Could not load ads. Showing empty list.");
        })
        .finally(() => setLoading(false));
    });
  }, [router]);

  async function handleStartAd(ad: AdItem) {
    if (!session) return;
    try {
      const data = await startAdSession(session.tokenOrId, session.isToken, ad.id);
      setViewer({ ad, sessionId: data.sessionId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start ad");
    }
  }

  async function handleComplete(sessionId: string) {
    if (!session) return;
    const result = await completeAdSession(session.tokenOrId, session.isToken, sessionId);
    setRewardMessage(`Earned $${(result.rewardCents / 100).toFixed(2)}!`);
    setViewer(null);
    setTimeout(() => setRewardMessage(null), 4000);
  }

  const msgStyle: React.CSSProperties = { color: "#9ca3af" };
  if (!session && !loading) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6" style={{ backgroundColor: "#111827" }}>
        <p className="text-fintech-muted" style={msgStyle}>Redirecting to login…</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6" style={{ backgroundColor: "#111827" }}>
        <p className="text-fintech-muted" style={msgStyle}>Loading ads…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 tablet:space-y-6">
      <div className="max-w-2xl">
        <BannerRotator placement="ads-page" />
      </div>
      <div className="animate-slide-up rounded-xl bg-fintech-bg-card border border-white/10 p-4 tablet:p-6">
        <h1 className="text-xl font-bold text-white mb-2">Ad Opportunities</h1>
        <p className="text-sm text-fintech-muted mb-6">
          Watch or complete ads to earn rewards. Rewards are issued only after the required time and verified by the backend.
        </p>
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
        )}
        {rewardMessage && (
          <div className="mb-4 p-3 rounded-lg bg-green-500/20 text-green-400 text-sm">{rewardMessage}</div>
        )}
        {adsList.length === 0 ? (
          <p className="text-fintech-muted">No ads available right now. Check back later.</p>
        ) : (
          <>
            {adsList.filter((a) => a.adType === "video").length > 0 && (
              <section className="mb-8">
                <h2 className="text-lg font-semibold text-white mb-3">Video ads</h2>
                <p className="text-sm text-fintech-muted mb-4">Watch video ads to earn rewards.</p>
                <ul className="grid grid-cols-1 gap-4 tablet:grid-cols-2 lg:grid-cols-3 mb-6">
                  {adsList
                    .filter((ad) => ad.adType === "video")
                    .map((ad) => (
                      <li
                        key={ad.id}
                        className="rounded-xl border border-white/10 bg-black/20 p-4 tablet:p-5 hover:border-fintech-accent/50 transition-colors"
                      >
                        <h3 className="font-semibold text-white mb-1">{ad.title}</h3>
                        <div className="flex flex-wrap gap-2 text-sm text-fintech-muted mb-3">
                          <span className="px-2 py-0.5 rounded bg-white/10">Video</span>
                          <span className="text-fintech-money font-medium">{formatReward(ad.rewardCents)}</span>
                          <span>{ad.requiredSeconds}s</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleStartAd(ad)}
                          className="min-h-touch w-full rounded-xl py-3 bg-fintech-accent text-white font-medium transition-opacity hover:opacity-90"
                        >
                          Watch video
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
            )}
            <h2 className="text-lg font-semibold text-white mb-3">All ad opportunities</h2>
          <ul className="grid grid-cols-1 gap-4 tablet:grid-cols-2 lg:grid-cols-3">
            {adsList.map((ad) => (
              <li
                key={ad.id}
                className="rounded-xl border border-white/10 bg-black/20 p-4 tablet:p-5 hover:border-fintech-accent/50 transition-colors"
              >
                <h2 className="font-semibold text-white mb-1">{ad.title}</h2>
                <div className="flex flex-wrap gap-2 text-sm text-fintech-muted mb-3">
                  <span className="px-2 py-0.5 rounded bg-white/10">
                    {AD_TYPE_LABELS[ad.adType] ?? ad.adType}
                  </span>
                  <span className="text-fintech-money font-medium">{formatReward(ad.rewardCents)}</span>
                  <span>{ad.requiredSeconds}s</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleStartAd(ad)}
                  className="min-h-touch w-full rounded-xl py-3 bg-fintech-accent text-white font-medium transition-opacity hover:opacity-90 active:opacity-90"
                >
                  Start
                </button>
              </li>
            ))}
          </ul>
          </>
        )}
      </div>

      {viewer && (
        <AdViewerModal
          ad={viewer.ad}
          sessionId={viewer.sessionId}
          onComplete={handleComplete}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
