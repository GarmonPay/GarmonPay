"use client";

/* eslint-disable @next/next/no-img-element -- runtime SVG blobs after token replace */
import { useEffect, useState } from "react";
import type { LayeredFighterAvatarConfig } from "@/lib/fighter-layered-avatar-map";
import { layeredAvatarHeightForSize } from "@/lib/fighter-layered-avatar-map";

function useReplacedSvgUrl(src: string | undefined, tokens: Record<string, string>): string | null {
  const tokenKey = JSON.stringify(tokens);
  const [url, setUrl] = useState<string | null>(null);

  /* eslint-disable-next-line react-hooks/exhaustive-deps -- tokenKey serializes `tokens` (stable when values match) */
  useEffect(() => {
    if (!src) {
      setUrl(null);
      return;
    }
    let alive = true;
    let created: string | null = null;
    void (async () => {
      try {
        const res = await fetch(src);
        let text = await res.text();
        for (const [token, val] of Object.entries(tokens)) {
          text = text.split(token).join(val);
        }
        const blob = new Blob([text], { type: "image/svg+xml;charset=utf-8" });
        const u = URL.createObjectURL(blob);
        created = u;
        if (alive) setUrl(u);
        else URL.revokeObjectURL(u);
      } catch {
        if (alive) setUrl(null);
      }
    })();
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [src, tokenKey]);

  return url;
}

export type LayeredFighterAvatarProps = {
  config: LayeredFighterAvatarConfig;
  size?: "small" | "medium" | "large";
  className?: string;
};

export default function LayeredFighterAvatar({ config, size = "medium", className }: LayeredFighterAvatarProps) {
  const h = layeredAvatarHeightForSize(size);
  const bodySrc = useReplacedSvgUrl(config.bodyUrl, {
    SKIN_LIGHT: config.skinLight,
    SKIN_DARK: config.skinDark,
  });
  const shortsSrc = useReplacedSvgUrl(config.shortsUrl, { SHORTS_FILL: config.trunksColor });
  const glovesSrc = useReplacedSvgUrl(config.glovesUrl, { GLOVE_FILL: config.gloveColor });

  const layerClass =
    "pointer-events-none absolute inset-0 h-full w-full select-none object-contain object-bottom";

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        minHeight: h,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        className="relative max-w-full"
        style={{
          width: `${(h * 400) / 640}px`,
          aspectRatio: "400 / 640",
          transform: `scale(${config.bodyScale})`,
          transformOrigin: "50% 100%",
        }}
      >
        {bodySrc ? <img src={bodySrc} alt="" className={layerClass} draggable={false} /> : null}
        {shortsSrc ? <img src={shortsSrc} alt="" className={layerClass} draggable={false} /> : null}
        <img src={config.shoesUrl} alt="" className={layerClass} draggable={false} />
        {glovesSrc ? <img src={glovesSrc} alt="" className={layerClass} draggable={false} /> : null}
        <img src={config.faceUrl} alt="" className={layerClass} draggable={false} />
        <img src={config.hairUrl} alt="" className={layerClass} draggable={false} />
        <img src={config.accessoryUrl} alt="" className={layerClass} draggable={false} />
      </div>
    </div>
  );
}
