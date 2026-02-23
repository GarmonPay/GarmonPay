"use client";

import { useEffect, useState } from "react";
import { VideoAdPlayer } from "./VideoAdPlayer";

export type AdType = "video" | "image" | "text" | "website_visit" | "app_download";

interface AdViewerModalProps {
  ad: {
    id: string;
    title: string;
    adType: AdType | string;
    rewardCents: number;
    requiredSeconds: number;
    videoUrl?: string;
    imageUrl?: string;
    textContent?: string;
    targetUrl?: string;
  };
  sessionId: string;
  onComplete: (sessionId: string) => Promise<void>;
  onClose: () => void;
}

export function AdViewerModal({ ad, sessionId, onComplete, onClose }: AdViewerModalProps) {
  if (ad.adType === "video" && ad.videoUrl) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()}>
          <VideoAdPlayer
            videoUrl={ad.videoUrl}
            requiredSeconds={ad.requiredSeconds}
            sessionId={sessionId}
            onComplete={onComplete}
            onCancel={onClose}
          />
        </div>
      </div>
    );
  }

  return (
    <NonVideoAdView
      ad={ad}
      sessionId={sessionId}
      onComplete={onComplete}
      onClose={onClose}
    />
  );
}

function NonVideoAdView({
  ad,
  sessionId,
  onComplete,
  onClose,
}: {
  ad: AdViewerModalProps["ad"];
  sessionId: string;
  onComplete: (sessionId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(ad.requiredSeconds);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  useEffect(() => {
    if (secondsLeft > 0 || completed || submitting) return;
    setSubmitting(true);
    onComplete(sessionId)
      .then(() => setCompleted(true))
      .finally(() => setSubmitting(false));
  }, [secondsLeft, sessionId, onComplete, completed, submitting]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={onClose}>
      <div
        className="rounded-xl bg-fintech-bg-card border border-white/10 p-6 max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-white mb-2">{ad.title}</h3>
        <p className="text-fintech-muted text-sm mb-4">
          {ad.adType} ad — reward <span className="text-fintech-money">${(ad.rewardCents / 100).toFixed(2)}</span> after {ad.requiredSeconds}s
        </p>
        {ad.adType === "image" && ad.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ad.imageUrl} alt={ad.title} className="w-full rounded-lg mb-4" />
        )}
        {ad.adType === "text" && ad.textContent && (
          <p className="text-white/90 mb-4">{ad.textContent}</p>
        )}
        {(ad.adType === "website_visit" || ad.adType === "app_download") && ad.targetUrl && (
          <a
            href={ad.targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fintech-accent hover:underline block mb-4"
          >
            {ad.adType === "website_visit" ? "Visit website" : "Download app"} →
          </a>
        )}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="px-3 py-2 rounded-lg bg-black/40 text-white text-sm font-medium">
            {secondsLeft > 0
              ? `Keep viewing ${secondsLeft}s to earn reward`
              : submitting
                ? "Claiming reward…"
                : completed
                  ? "Reward earned!"
                  : "Complete to earn"}
          </div>
        </div>
        <p className="text-fintech-muted text-xs mb-4">
          Reward is verified on the server only after the required time.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 rounded-lg border border-white/20 text-white hover:bg-white/5"
        >
          {completed ? "Close" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
