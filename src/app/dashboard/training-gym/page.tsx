import { ProBoxingExperience } from "@/components/games/boxing/ProBoxingExperience";

export default function TrainingGymPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Training Gym</h1>
      <p className="text-sm text-fintech-muted">
        Improve your fighter with paid drills: punching bag, speed bag, shadow boxing, and footwork.
      </p>
      <ProBoxingExperience defaultSection="training" />
    </div>
  );
}
