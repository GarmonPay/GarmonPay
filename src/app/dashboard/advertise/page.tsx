"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSessionAsync } from "@/lib/session";
import {
  createAdvertiserProfile,
  createAd,
  createAdDepositCheckout,
  getMyAds,
  getAdvertiserMe,
} from "@/lib/api";
import { PLATFORMS } from "@/components/ads/SocialPlatformLink";
import { AdPackagesCardGrid } from "@/components/advertising/AdPackagesCardGrid";
import { formatAdViews, type AdPackageRow } from "@/lib/ad-packages";

const AD_TYPES = [
  { id: "video", label: "Video Ad", desc: "Upload a video" },
  { id: "banner", label: "Banner Ad", desc: "Upload an image" },
  { id: "social", label: "Social Follow Ad", desc: "Add social links" },
  { id: "product", label: "Link Ad", desc: "Drive traffic to your site" },
] as const;

const MIN_BUDGET = 5;
const TITLE_MAX = 50;
const DESC_MAX = 200;

type Step = 1 | 2 | 3 | 4;

export default function AdvertisePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean } | null>(null);
  const [hasAdvertiser, setHasAdvertiser] = useState(false);
  const [myAds, setMyAds] = useState<Array<{
    id: string;
    title: string;
    status: string;
    isActive: boolean;
    totalBudget: number;
    remainingBudget: number;
    spent: number;
    views: number;
    clicks: number;
    follows: number;
    shares: number;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create ad wizard state
  const [step, setStep] = useState<Step>(1);
  const [adType, setAdType] = useState<"video" | "banner" | "social" | "product">("video");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [socialUrls, setSocialUrls] = useState<Record<string, string>>({});
  const [budget, setBudget] = useState(MIN_BUDGET);
  const [customBudget, setCustomBudget] = useState("");

  // Advertiser onboarding
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState("");
  const [website, setWebsite] = useState("");
  const [advertiserDesc, setAdvertiserDesc] = useState("");
  const [creatingAdvertiser, setCreatingAdvertiser] = useState(false);
  const [paying, setPaying] = useState(false);
  const [adPackages, setAdPackages] = useState<AdPackageRow[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [packagesError, setPackagesError] = useState<string | null>(null);
  /** Same Supabase row as public /advertise — drives budget + step 3 */
  const [selectedPackage, setSelectedPackage] = useState<AdPackageRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ad-packages?t=${Date.now()}`, { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as { packages?: AdPackageRow[]; message?: string };
        if (cancelled) return;
        if (!r.ok) {
          setPackagesError(typeof data?.message === "string" ? data.message : "Could not load packages");
          setAdPackages([]);
          return;
        }
        setPackagesError(null);
        setAdPackages(Array.isArray(data?.packages) ? data.packages : []);
      })
      .catch(() => {
        if (!cancelled) {
          setPackagesError("Could not load packages");
          setAdPackages([]);
        }
      })
      .finally(() => {
        if (!cancelled) setPackagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    getSessionAsync().then(async (s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/advertise");
        return;
      }
      const tokenOrId = s.accessToken ?? s.userId;
      const isToken = !!s.accessToken;
      setSession({ tokenOrId, isToken });
      try {
        const advRes = await getAdvertiserMe(tokenOrId, isToken);
        setHasAdvertiser(!!advRes?.advertiserId);
        const res = await getMyAds(tokenOrId, isToken);
        setMyAds(res?.ads ?? []);
        const success = searchParams.get("success");
        const canceled = searchParams.get("canceled");
        if (success === "1") {
          setSuccess("Payment received! Your ad will go live after approval.");
          window.history.replaceState({}, "", "/dashboard/advertise");
        } else if (canceled === "1") {
          setError("Payment canceled. You can add funds to your ad from My Ads.");
          window.history.replaceState({}, "", "/dashboard/advertise");
        }
      } catch {
        setMyAds([]);
      } finally {
        setLoading(false);
      }
    });
  }, [router, searchParams]);

  const handleSelectPackage = (pkg: AdPackageRow) => {
    setSelectedPackage(pkg);
    const monthly = Number(pkg.price_monthly);
    if (Number.isFinite(monthly) && monthly >= MIN_BUDGET) {
      setBudget(monthly);
    } else if (Number.isFinite(monthly)) {
      setBudget(MIN_BUDGET);
    }
    setCustomBudget("");
    setError(null);
  };

  const handleCreateAdvertiser = async () => {
    if (!session || !businessName.trim()) return;
    setCreatingAdvertiser(true);
    setError(null);
    try {
      await createAdvertiserProfile(session.tokenOrId, session.isToken, {
        business_name: businessName.trim(),
        category: category.trim() || undefined,
        website: website.trim() || undefined,
        description: advertiserDesc.trim() || undefined,
      });
      setHasAdvertiser(true);
      setSuccess("Advertiser profile created.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create profile");
    } finally {
      setCreatingAdvertiser(false);
    }
  };

  const handlePayWithStripe = async () => {
    if (!session || !hasAdvertiser) return;
    if (title.length > TITLE_MAX || description.length > DESC_MAX) {
      setError("Title or description too long");
      return;
    }
    const amount = customBudget.trim() ? parseFloat(customBudget) : budget;
    if (isNaN(amount) || amount < MIN_BUDGET) {
      setError(`Minimum budget is $${MIN_BUDGET} to run an ad`);
      return;
    }
    setError(null);
    setPaying(true);
    try {
      const createRes = await createAd(session.tokenOrId, session.isToken, {
        title: title.trim(),
        description: description.trim() || undefined,
        ad_type: adType,
        media_url: mediaUrl.trim() || undefined,
        destination_url: destinationUrl.trim() || undefined,
        total_budget: 0,
        ...(adType === "social" && {
          instagram_url: socialUrls.instagram || undefined,
          tiktok_url: socialUrls.tiktok || undefined,
          youtube_url: socialUrls.youtube || undefined,
          twitter_url: socialUrls.twitter || undefined,
          facebook_url: socialUrls.facebook || undefined,
          twitch_url: socialUrls.twitch || undefined,
        }),
      });
      const adId = (createRes as { adId?: string }).adId;
      if (!adId) throw new Error("Ad created but no ID returned");
      const checkoutRes = await createAdDepositCheckout(session.tokenOrId, session.isToken, { adId, amount });
      const url = (checkoutRes as { url?: string }).url;
      if (url) {
        window.location.href = url;
        return;
      }
      throw new Error("Could not start checkout");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create ad or start payment");
      setPaying(false);
    }
  };

  if (!session && !loading) {
    return (
      <div className="card-lux p-6">
        <p className="text-fintech-muted">Redirecting…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card-lux p-4 tablet:p-6">
        <h1 className="text-xl font-bold text-white mb-1">Advertise</h1>
        <p className="text-fintech-muted text-sm">Get Seen. Get Known. Get Paid.</p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-fintech-success/10 border border-fintech-success/30 text-fintech-success px-4 py-2 text-sm">
          {success}
        </div>
      )}

      {/* 1) Ad packages — always visible when logged in (same API + data as /advertise) */}
      {session && (
        <div className="card-lux p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Choose your plan</h2>
          <p className="text-sm text-fintech-muted mb-6">
            Packages load from Supabase. Select one to set your campaign budget, then create your profile and start your campaign.
          </p>
          <AdPackagesCardGrid
            variant="dashboard"
            packages={adPackages}
            loading={packagesLoading}
            error={packagesError}
            selectedPackageId={selectedPackage?.id ?? null}
            onSelectPackage={handleSelectPackage}
          />
        </div>
      )}

      {session && selectedPackage && (
        <div className="rounded-xl border border-fintech-accent/40 bg-fintech-accent/10 px-4 py-3 text-sm text-white">
          <span className="text-fintech-muted">Selected plan: </span>
          <strong>{selectedPackage.name}</strong>
          {" — "}
          ${Number(selectedPackage.price_monthly).toFixed(2)}/mo · {formatAdViews(selectedPackage.ad_views)} ad views
          {!hasAdvertiser && (
            <span className="block mt-2 text-fintech-muted">
              Next: fill out your advertiser profile below, then you can create your campaign.
            </span>
          )}
          {hasAdvertiser && (
            <span className="block mt-2 text-fintech-muted">
              Use <strong>Create your ad</strong> below — your budget step will use this plan unless you enter a custom amount.
            </span>
          )}
        </div>
      )}

      {/* 2) Advertiser onboarding */}
      {!hasAdvertiser && session && (
        <div className="card-lux p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Create your advertiser profile</h2>
          <div className="space-y-3 max-w-md">
            <label className="block text-sm text-fintech-muted">Business name *</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white"
              placeholder="Your business or brand"
            />
            <label className="block text-sm text-fintech-muted">Category</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white"
              placeholder="e.g. Fitness, Fashion"
            />
            <label className="block text-sm text-fintech-muted">Website</label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white"
              placeholder="https://..."
            />
            <label className="block text-sm text-fintech-muted">Description</label>
            <textarea
              value={advertiserDesc}
              onChange={(e) => setAdvertiserDesc(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white resize-none"
              rows={2}
              placeholder="Short description"
            />
            <button
              type="button"
              onClick={handleCreateAdvertiser}
              disabled={creatingAdvertiser || !businessName.trim()}
              className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {creatingAdvertiser ? "Creating…" : "Create profile"}
            </button>
          </div>
        </div>
      )}

      {/* Create your ad wizard */}
      {hasAdvertiser && (
        <div className="card-lux p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Create your campaign</h2>
          <p className="text-sm text-fintech-muted mb-4">
            Pick ad type, content, budget, then pay. Your plan and profile are already set above.
          </p>
          {step === 1 && (
            <>
              <p className="text-sm text-fintech-muted mb-4">Choose ad type</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {AD_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setAdType(t.id); setStep(2); }}
                    className="rounded-xl border border-white/10 p-4 text-left hover:border-fintech-accent hover:bg-white/5"
                  >
                    <span className="font-medium text-white">{t.label}</span>
                    <p className="text-sm text-fintech-muted mt-1">{t.desc}</p>
                  </button>
                ))}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <p className="text-sm text-fintech-muted mb-4">Add content</p>
              <div className="space-y-3 max-w-lg">
                <div>
                  <label className="block text-sm text-fintech-muted">Title (max {TITLE_MAX})</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                    className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-fintech-muted">Description (max {DESC_MAX})</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))}
                    className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white resize-none"
                    rows={3}
                  />
                </div>
                {(adType === "video" || adType === "banner") && (
                  <div>
                    <label className="block text-sm text-fintech-muted">Media URL</label>
                    <input
                      type="url"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white"
                      placeholder="https://..."
                    />
                  </div>
                )}
                {(adType === "product" || adType === "video" || adType === "banner") && (
                  <div>
                    <label className="block text-sm text-fintech-muted">Destination URL</label>
                    <input
                      type="url"
                      value={destinationUrl}
                      onChange={(e) => setDestinationUrl(e.target.value)}
                      className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white"
                      placeholder="https://..."
                    />
                  </div>
                )}
                {adType === "social" && (
                  <div className="space-y-2">
                    <label className="block text-sm text-fintech-muted">Social links</label>
                    {(Object.keys(PLATFORMS) as Array<keyof typeof PLATFORMS>).map((key) => (
                      <input
                        key={key}
                        type="url"
                        value={socialUrls[key] ?? ""}
                        onChange={(e) => setSocialUrls((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white text-sm"
                        placeholder={PLATFORMS[key].placeholder}
                      />
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-xl border border-white/20 px-4 py-2 text-sm"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-medium text-white"
                  >
                    Next: Budget
                  </button>
                </div>
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <p className="text-sm text-fintech-muted mb-4">Set budget (min ${MIN_BUDGET})</p>
              <p className="text-xs text-fintech-muted mb-3">
                Your plan was chosen above. Change it anytime by scrolling to <strong>Choose your plan</strong>.
              </p>
              <div className="space-y-3 max-w-lg">
                {selectedPackage ? (
                  <div className="rounded-lg border border-fintech-accent/40 bg-fintech-accent/10 px-3 py-2 text-sm text-white">
                    <span className="text-fintech-muted">Using plan: </span>
                    {selectedPackage.name} — ${Number(selectedPackage.price_monthly).toFixed(2)}/mo ·{" "}
                    {formatAdViews(selectedPackage.ad_views)} views
                  </div>
                ) : (
                  <p className="text-sm text-amber-400/90">
                    No plan selected yet — pick one under <strong>Choose your plan</strong> above, or enter a custom amount below.
                  </p>
                )}
                <div>
                  <label className="block text-sm text-fintech-muted">Campaign budget ($)</label>
                  <input
                    type="number"
                    min={MIN_BUDGET}
                    step={1}
                    value={customBudget}
                    onChange={(e) => setCustomBudget(e.target.value)}
                    placeholder={
                      selectedPackage
                        ? `Default from plan: $${Number(selectedPackage.price_monthly).toFixed(2)}`
                        : `Minimum $${MIN_BUDGET}`
                    }
                    className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-white"
                  />
                  <p className="mt-1 text-xs text-fintech-muted">
                    Leave blank to use your selected plan amount (${budget.toFixed(2)}) at checkout.
                  </p>
                </div>
                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={() => setStep(2)} className="rounded-xl border border-white/20 px-4 py-2 text-sm">
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-medium text-white"
                  >
                    Next: Review
                  </button>
                </div>
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <p className="text-sm text-fintech-muted mb-4">Review and pay</p>
              <div className="max-w-lg space-y-2 text-sm">
                <p><span className="text-fintech-muted">Type:</span> {adType}</p>
                <p><span className="text-fintech-muted">Title:</span> {title || "—"}</p>
                <p>
                  <span className="text-fintech-muted">Budget:</span> $
                  {(customBudget.trim() ? parseFloat(customBudget) : budget).toFixed(2)}
                </p>
              </div>
              <p className="text-xs text-fintech-muted mt-4">
                Pay with Stripe to fund your ad. Minimum $5. After payment your ad will be submitted for review and go live when approved.
              </p>
              <div className="flex gap-2 mt-4">
                <button type="button" onClick={() => setStep(3)} className="rounded-xl border border-white/20 px-4 py-2 text-sm" disabled={paying}>
                  Back
                </button>
                <button
                  type="button"
                  onClick={handlePayWithStripe}
                  disabled={paying}
                  className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {paying
                    ? "Redirecting to Stripe…"
                    : `Pay $${(customBudget.trim() ? parseFloat(customBudget) : budget).toFixed(2)} with Stripe`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* My ads */}
      {hasAdvertiser && (
        <div className="card-lux p-6">
          <h2 className="text-lg font-semibold text-white mb-4">My ads</h2>
          {loading ? (
            <p className="text-fintech-muted">Loading…</p>
          ) : myAds.length === 0 ? (
            <p className="text-fintech-muted">No ads yet. Create one above.</p>
          ) : (
            <div className="space-y-3">
              {myAds.map((ad) => (
                <div
                  key={ad.id}
                  className="rounded-xl border border-white/10 p-4 flex flex-wrap justify-between gap-2"
                >
                  <div>
                    <p className="font-medium text-white">{ad.title}</p>
                    <span className={`text-xs px-2 py-0.5 rounded ${ad.status === "active" ? "bg-fintech-success/20 text-fintech-success" : "bg-white/10 text-fintech-muted"}`}>
                      {ad.status}
                    </span>
                  </div>
                  <div className="flex gap-4 text-sm text-fintech-muted">
                    <span>Views {ad.views}</span>
                    <span>Clicks {ad.clicks}</span>
                    <span>Follows {ad.follows}</span>
                    <span>Spent ${ad.spent.toFixed(2)}</span>
                    <span>Remaining ${ad.remainingBudget.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Social media manager placeholder */}
      {hasAdvertiser && (
        <div className="card-lux p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Social media</h2>
          <p className="text-sm text-fintech-muted mb-4">Add your social links when creating a Social Follow ad, or use the Add link API.</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PLATFORMS) as Array<keyof typeof PLATFORMS>).map((key) => (
              <div key={key} className="rounded-lg border border-white/10 px-3 py-2" style={{ borderLeftColor: PLATFORMS[key].color, borderLeftWidth: 4 }}>
                <span className="text-sm text-white">{PLATFORMS[key].name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Billing placeholder */}
      {hasAdvertiser && (
        <div className="card-lux p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Billing</h2>
          <p className="text-sm text-fintech-muted">Add funds via Stripe when you create an ad. Minimum $5 to run. Unused budget refundable minus 10% processing fee.</p>
        </div>
      )}
    </div>
  );
}
