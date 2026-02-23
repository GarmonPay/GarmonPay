"use client";

import { useEffect, useState, useCallback } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const ROTATION_SECONDS = 5;

type BannerItem = { id: string; title: string; image_url: string; target_url: string };

export interface BannerRotatorProps {
  /** Rotation interval in seconds. Default 5. */
  rotationIntervalSeconds?: number;
  /** Placement for styling: "dashboard-top" | "dashboard-sidebar" | "ads-page" | "homepage" */
  placement?: "dashboard-top" | "dashboard-sidebar" | "ads-page" | "homepage";
  /** Optional class for container. */
  className?: string;
}

export function BannerRotator({
  rotationIntervalSeconds = ROTATION_SECONDS,
  placement = "dashboard-top",
  className = "",
}: BannerRotatorProps) {
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/banners/rotator`)
      .then((r) => r.json())
      .then((data) => {
        setBanners(data.banners ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const current = banners[index] ?? null;

  const recordImpression = useCallback((bannerId: string) => {
    fetch(`${API_BASE}/api/banners/impression`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bannerId }),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!current) return;
    recordImpression(current.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, recordImpression]);

  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % banners.length);
    }, rotationIntervalSeconds * 1000);
    return () => clearInterval(t);
  }, [banners.length, rotationIntervalSeconds]);

  const handleClick = useCallback(() => {
    if (!current) return;
    fetch(`${API_BASE}/api/banners/click`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bannerId: current.id }),
    })
      .then((r) => r.json())
      .then((data) => {
        const url = data.target_url;
        if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      })
      .catch(() => {});
  }, [current]);

  if (loading || banners.length === 0) return null;

  const sizeClass =
    placement === "dashboard-sidebar"
      ? "h-24 sm:h-28 object-cover"
      : placement === "homepage"
        ? "h-32 sm:h-40 object-cover"
        : "h-28 sm:h-36 object-cover";

  return (
    <div
      className={`rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden ${className}`}
      data-placement={placement}
    >
      <button
        type="button"
        onClick={handleClick}
        className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-fintech-accent rounded-xl overflow-hidden"
        aria-label={current?.title || "Banner"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current!.image_url}
          alt={current!.title || "Banner"}
          className={`w-full ${sizeClass} bg-black/20`}
        />
      </button>
      {banners.length > 1 && (
        <div className="flex justify-center gap-1 py-1.5 border-t border-white/5">
          {banners.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${i === index ? "bg-fintech-accent" : "bg-white/30"}`}
              aria-hidden
            />
          ))}
        </div>
      )}
    </div>
  );
}
