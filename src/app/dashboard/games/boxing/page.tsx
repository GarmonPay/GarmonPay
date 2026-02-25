import Link from "next/link";

export default function Boxing() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">🥊 Boxing Arena</h1>
      <p className="text-fintech-muted text-sm">
        Join or create a fight. Winner takes the prize.
      </p>
      <Link
        href="/dashboard/games/boxing/live"
        className="inline-block w-full max-w-xs py-3 rounded-lg bg-fintech-accent text-white font-semibold text-center hover:opacity-90 transition-all focus:outline-none focus:ring-2 focus:ring-fintech-accent focus:ring-offset-2 focus:ring-offset-[#0f172a]"
      >
        Enter Arena
      </Link>
    </div>
  );
}
