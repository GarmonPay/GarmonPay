"use client";

import { useEffect, useState } from "react";

interface VideoAdPlayerProps {
  videoUrl: string;
  requiredSeconds: number;
  sessionId: string;
  onComplete: (sessionId: string) => Promise<void>;
  onCancel: () => void;
}

export function VideoAdPlayer({
  videoUrl,
  requiredSeconds,
  sessionId,
  onComplete,
  onCancel,
}: VideoAdPlayerProps) {
  const [secondsLeft, setSecondsLeft] = useState(requiredSeconds);
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
    <div className="rounded-xl bg-[#0a0e17] border border-white/10 overflow-hidden max-w-2xl mx-auto">
      <div className="aspect-video bg-black relative">
        <video
          src={videoUrl}
          controls
          autoPlay
          playsInline
          className="w-full h-full object-contain"
        />
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
          <div className="px-3 py-2 rounded-lg bg-black/70 text-white text-sm font-medium">
            {secondsLeft > 0
              ? `Watch ${secondsLeft}s to earn reward`
              : submitting
                ? "Claiming reward…"
                : completed
                  ? "Reward earned!"
                  : "Complete to earn"}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 rounded-lg bg-red-500/80 text-white text-sm hover:bg-red-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
