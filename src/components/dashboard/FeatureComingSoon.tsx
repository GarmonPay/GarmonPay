import Link from "next/link";

type Props = {
  emoji: string;
  title: string;
  description: string;
};

/** Matches dashboard/arena Coming Soon card (gold headline, back to dashboard). */
export function FeatureComingSoon({ emoji, title, description }: Props) {
  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-lg rounded-xl bg-fintech-bg-card border border-white/10 p-6 tablet:p-8 text-center">
        <div className="mb-4 text-4xl" aria-hidden>
          {emoji}
        </div>
        <h1 className="text-xl font-bold text-white mb-2">{title}</h1>
        <p className="text-2xl font-bold text-fintech-highlight mb-4">Coming Soon</p>
        <p className="text-sm text-fintech-muted mb-8 leading-relaxed">{description}</p>
        <Link
          href="/dashboard"
          className="inline-block rounded-xl bg-fintech-accent px-4 py-2 text-sm font-medium text-white hover:bg-fintech-accent/90"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
