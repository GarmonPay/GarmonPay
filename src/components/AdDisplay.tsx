"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export type AdPlacement = "homepage" | "dashboard" | "fight_arena";

interface AdItem {
  id: string;
  title: string;
  description: string;
  ad_type: "banner" | "video";
  file_url: string | null;
  target_url: string | null;
  placement: string;
  active: boolean;
  impressions: number;
  clicks: number;
  created_at: string;
}

interface AdDisplayProps {
  /** Where the ad is shown; only ads for this placement are loaded. */
  placement: AdPlacement;
  /** Optional CSS class for the container. */
  className?: string;
  /** Optional inline styles for the container. */
  style?: React.CSSProperties;
}

/**
 * Fetches active ads for the given placement, picks one at random, and displays it.
 * - Banner: clickable image; records impression on display, click on click.
 * - Video: HTML5 video, autoplay muted; skip button after 5 seconds.
 * Uses caching (fetch cache) and records impression once per mount.
 */
export function AdDisplay({ placement, className, style }: AdDisplayProps) {
  const [ad, setAd] = useState<AdItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const impressionSent = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch active ads for placement (cached by fetch)
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/advertisements?placement=${encodeURIComponent(placement)}`)
      .then((res) => res.json())
      .then((data: { ads?: AdItem[] }) => {
        if (cancelled) return;
        const list = data.ads ?? [];
        if (list.length === 0) {
          setAd(null);
          return;
        }
        const picked = list[Math.floor(Math.random() * list.length)];
        setAd(picked);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [placement]);

  // Record impression once when ad is shown
  const recordImpression = useCallback(() => {
    if (!ad?.id || impressionSent.current) return;
    impressionSent.current = true;
    fetch(`${API_BASE}/advertisements/impression`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ad.id }),
    }).catch(() => {});
  }, [ad?.id]);

  // Record click and optionally navigate
  const recordClick = useCallback(() => {
    if (!ad?.id) return;
    fetch(`${API_BASE}/advertisements/click`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ad.id }),
    }).catch(() => {});
    if (ad.target_url) {
      window.open(ad.target_url, "_blank", "noopener,noreferrer");
    }
  }, [ad?.id, ad?.target_url]);

  // When ad is set, record impression (banner or video)
  useEffect(() => {
    if (ad) recordImpression();
  }, [ad, recordImpression]);

  // Video: show skip after 5 seconds
  useEffect(() => {
    if (ad?.ad_type !== "video" || !ad.file_url) return;
    const t = setTimeout(() => setCanSkip(true), 5000);
    return () => clearTimeout(t);
  }, [ad?.ad_type, ad?.file_url]);

  if (loading || error || !ad) {
    return null;
  }

  const hasFile = !!ad.file_url;

  return (
    <div
      className={className}
      style={style}
      data-ad-placement={placement}
      data-ad-id={ad.id}
    >
      {ad.ad_type === "banner" && hasFile && (
        <a
          href={ad.target_url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            recordClick();
            if (!ad.target_url) e.preventDefault();
          }}
          className="block w-full overflow-hidden rounded-lg border border-white/10 bg-black/20"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ad.file_url}
            alt={ad.title}
            loading="lazy"
            decoding="async"
            className="w-full h-auto object-contain max-h-[280px]"
          />
        </a>
      )}

      {ad.ad_type === "video" && hasFile && (
        <div className="relative w-full overflow-hidden rounded-lg border border-white/10 bg-black">
          <video
            ref={videoRef}
            src={ad.file_url}
            autoPlay
            muted
            playsInline
            loop
            className="w-full h-auto max-h-[280px] object-contain"
            onEnded={() => setCanSkip(true)}
          />
          {canSkip && !skipped && (
            <button
              type="button"
              onClick={() => {
                setSkipped(true);
                recordClick();
                if (ad.target_url) {
                  window.open(ad.target_url, "_blank", "noopener,noreferrer");
                }
              }}
              className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-black/80 text-white text-sm font-medium hover:bg-black"
            >
              Skip →
            </button>
          )}
          {ad.target_url && skipped && (
            <a
              href={ad.target_url}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute inset-0"
              aria-label="Go to ad"
            />
          )}
        </div>
      )}

      {!hasFile && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center text-sm text-white/60">
          {ad.title}
        </div>
      )}
    </div>
  );
}
