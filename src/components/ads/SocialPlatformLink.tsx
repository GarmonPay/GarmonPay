"use client";

export const PLATFORMS = {
  instagram: {
    name: "Instagram",
    color: "#E1306C",
    icon: "📸",
    urlPrefix: "https://instagram.com/",
    placeholder: "@username",
  },
  tiktok: {
    name: "TikTok",
    color: "#000000",
    icon: "🎵",
    urlPrefix: "https://tiktok.com/@",
    placeholder: "@username",
  },
  youtube: {
    name: "YouTube",
    color: "#FF0000",
    icon: "▶️",
    urlPrefix: "https://youtube.com/@",
    placeholder: "@channel",
  },
  twitter: {
    name: "Twitter/X",
    color: "#000000",
    icon: "𝕏",
    urlPrefix: "https://twitter.com/",
    placeholder: "@username",
  },
  facebook: {
    name: "Facebook",
    color: "#1877F2",
    icon: "👤",
    urlPrefix: "https://facebook.com/",
    placeholder: "page or profile name",
  },
  twitch: {
    name: "Twitch",
    color: "#9146FF",
    icon: "🎮",
    urlPrefix: "https://twitch.tv/",
    placeholder: "username",
  },
} as const;

export type PlatformKey = keyof typeof PLATFORMS;

interface SocialPlatformLinkProps {
  platform: PlatformKey;
  url: string | null;
  label?: string;
  earnAmount?: number;
  onFollow?: () => void;
  disabled?: boolean;
  compact?: boolean;
}

export function SocialPlatformLink({
  platform,
  url,
  label,
  earnAmount,
  onFollow,
  disabled,
  compact,
}: SocialPlatformLinkProps) {
  const p = PLATFORMS[platform];
  if (!url) return null;

  const handleClick = () => {
    if (disabled) return;
    window.open(url, "_blank", "noopener,noreferrer");
    onFollow?.();
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: p.color }}
        aria-label={`Follow on ${p.name}`}
      >
        <span aria-hidden>{p.icon}</span>
        <span>{p.name}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
      style={{ backgroundColor: p.color }}
      aria-label={label ?? `Follow on ${p.name}`}
    >
      <span aria-hidden>{p.icon}</span>
      <span>{label ?? `Follow on ${p.name}`}</span>
      {earnAmount != null && earnAmount > 0 && (
        <span className="opacity-90">Earn ${earnAmount.toFixed(3)}</span>
      )}
    </button>
  );
}

/** Render multiple social links as colored buttons from ad URLs. */
export function AdvertiserSocialLinks({
  urls,
  userEarnsFollow,
  onFollow,
  disabled,
}: {
  urls: {
    instagram?: string | null;
    tiktok?: string | null;
    youtube?: string | null;
    twitter?: string | null;
    facebook?: string | null;
    twitch?: string | null;
  };
  userEarnsFollow?: number;
  onFollow?: (platform: PlatformKey) => void;
  disabled?: boolean;
}) {
  const entries = (Object.entries(PLATFORMS) as [PlatformKey, (typeof PLATFORMS)[PlatformKey]][]).filter(
    ([k]) => urls[k as keyof typeof urls]
  );
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([key]) => (
        <SocialPlatformLink
          key={key}
          platform={key}
          url={urls[key as keyof typeof urls] as string}
          earnAmount={userEarnsFollow}
          onFollow={() => onFollow?.(key)}
          disabled={disabled}
          compact
        />
      ))}
    </div>
  );
}
