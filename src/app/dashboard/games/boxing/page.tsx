import { ProBoxingExperience } from "@/components/games/boxing/ProBoxingExperience";

type Section = "arena" | "training" | "fighter" | "leaderboard" | "tournaments";

export default function Boxing({
  searchParams,
}: {
  searchParams?: { section?: string; tab?: string };
}) {
  const requested = (searchParams?.section ?? searchParams?.tab ?? "arena").toLowerCase();
  const section: Section =
    requested === "training"
      ? "training"
      : requested === "fighter"
      ? "fighter"
      : requested === "leaderboard"
      ? "leaderboard"
      : requested === "tournaments"
      ? "tournaments"
      : "arena";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Professional Boxing Arena</h1>
        <p className="mt-1 text-sm text-fintech-muted">
          Real-time 3D ring action, AI styles, training gym progression, fighter customization, and wallet-powered tournaments.
        </p>
      </div>
      <ProBoxingExperience defaultSection={section} />
    </div>
  );
}
