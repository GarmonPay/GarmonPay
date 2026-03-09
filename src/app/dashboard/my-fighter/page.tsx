import { ProBoxingExperience } from "@/components/games/boxing/ProBoxingExperience";

export default function MyFighterPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">My Fighter</h1>
      <p className="text-sm text-fintech-muted">
        Customize your boxer, switch between male/female models, manage cosmetics, and review progression stats.
      </p>
      <ProBoxingExperience defaultSection="fighter" />
    </div>
  );
}
