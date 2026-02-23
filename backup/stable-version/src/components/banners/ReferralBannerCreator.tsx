"use client";

import { useRef, useState, useCallback, useEffect } from "react";

export type ReferralBannerTemplate = "dark" | "accent" | "green";

const TEMPLATES: { id: ReferralBannerTemplate; name: string; bg: string; fg: string; cta: string }[] = [
  { id: "dark", name: "Dark", bg: "#0a0e17", fg: "#f9fafb", cta: "#2563eb" },
  { id: "accent", name: "Accent", bg: "linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)", fg: "#f9fafb", cta: "#38bdf8" },
  { id: "green", name: "Green CTA", bg: "#111827", fg: "#e5e7eb", cta: "#10b981" },
];

const WIDTH = 728;
const HEIGHT = 90;

export interface ReferralBannerCreatorProps {
  referralLink: string;
  referralCode?: string;
}

function drawBanner(
  ctx: CanvasRenderingContext2D,
  template: (typeof TEMPLATES)[0],
  referralLink: string,
  pixelRatio: number
) {
  const w = WIDTH * pixelRatio;
  const h = HEIGHT * pixelRatio;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(pixelRatio, pixelRatio);
  const isGradient = template.bg.startsWith("linear");
  if (isGradient) {
    const g = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    g.addColorStop(0, "#0f172a");
    g.addColorStop(1, "#1e3a5f");
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = template.bg;
  }
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = template.fg;
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.fillText("GarmonPay", 20, 38);
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("Earn with us — Join now", 20, 58);
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  const linkText = referralLink.length > 50 ? referralLink.slice(0, 47) + "…" : referralLink;
  ctx.fillText(linkText, 20, 78);
  ctx.fillStyle = template.cta;
  ctx.beginPath();
  ctx.roundRect(WIDTH - 140, 32, 120, 36, 6);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Join now", WIDTH - 80, 55);
  ctx.textAlign = "left";
}

export function ReferralBannerCreator({ referralLink }: ReferralBannerCreatorProps) {
  const [selected, setSelected] = useState<ReferralBannerTemplate>("dark");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const template = TEMPLATES.find((t) => t.id === selected) ?? TEMPLATES[0];
  const isGradient = template.bg.startsWith("linear");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !referralLink) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    canvas.style.width = `${WIDTH}px`;
    canvas.style.height = `${HEIGHT}px`;
    drawBanner(ctx, template, referralLink, dpr);
  }, [selected, referralLink, template]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = 2;
    const off = document.createElement("canvas");
    off.width = WIDTH * dpr;
    off.height = HEIGHT * dpr;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    drawBanner(offCtx, template, referralLink, dpr);
    const link = document.createElement("a");
    link.download = `garmonpay-referral-${template.id}-${Date.now()}.png`;
    link.href = off.toDataURL("image/png");
    link.click();
  }, [template, referralLink]);

  const handleShare = useCallback(() => {
    if (navigator.share) {
      navigator.share({
        title: "Join GarmonPay",
        text: "Earn with us — Join now",
        url: referralLink,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(referralLink).then(() => {});
    }
  }, [referralLink]);

  return (
    <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
      <h3 className="text-lg font-bold text-white mb-2">Referral Banner Creator</h3>
      <p className="text-fintech-muted text-sm mb-4">
        Pick a template. Your referral link is included. Download or share.
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelected(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selected === t.id ? "bg-fintech-accent text-white" : "bg-white/10 text-fintech-muted hover:bg-white/15"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>
      <div className="mb-4 p-4 rounded-lg bg-black/30 border border-white/10 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={WIDTH * 2}
          height={HEIGHT * 2}
          className="max-w-full h-auto rounded block"
          style={{
            width: "100%",
            maxWidth: WIDTH,
            height: "auto",
            background: isGradient ? "#0f172a" : template.bg,
          }}
        />
        <div className="mt-2 flex items-center justify-between flex-wrap gap-2 text-xs text-fintech-muted">
          <span className="truncate">GarmonPay — Earn with us — Join now</span>
          <span className="truncate max-w-[200px] sm:max-w-none">{referralLink}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleDownload}
          className="px-4 py-2 rounded-lg bg-fintech-accent text-white font-medium text-sm hover:bg-fintech-accent/90"
        >
          Download banner
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="px-4 py-2 rounded-lg border border-white/20 text-white font-medium text-sm hover:bg-white/10"
        >
          Share link
        </button>
      </div>
    </div>
  );
}
