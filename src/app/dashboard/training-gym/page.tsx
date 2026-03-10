"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { getDashboard } from "@/lib/api";

type Fighter = {
  id: string;
  name: string;
  speed: number;
  power: number;
  defense: number;
  stamina?: number;
  experience?: number;
  wins: number;
  losses: number;
  level: number;
};

const TRAINING_ACTIVITIES = [
  { id: "power", stat: "power", label: "Punching bag", costCents: 200, desc: "Increases power.", icon: "🥊" },
  { id: "speed", stat: "speed", label: "Speed bag", costCents: 100, desc: "Increases speed.", icon: "⚡" },
  { id: "defense", stat: "defense", label: "Shadow boxing", costCents: 200, desc: "Increases defense.", icon: "🛡️" },
  { id: "stamina", stat: "stamina", label: "Footwork drills", costCents: 200, desc: "Increases stamina.", icon: "🦵" },
];

function formatCents(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

export default function TrainingGymPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean } | null>(null);
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [selectedFighterId, setSelectedFighterId] = useState<string | null>(null);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/training-gym");
        return;
      }
      const tokenOrId = s.accessToken ?? s.userId;
      const isToken = !!s.accessToken;
      setSession({ tokenOrId, isToken });
      Promise.all([
        getDashboard(tokenOrId, isToken).then((d) => setBalanceCents(d.balanceCents ?? 0)),
        fetch("/api/fighters", { credentials: "include" })
          .then((r) => r.json())
          .then((data: { fighters?: Fighter[] }) => setFighters(data.fighters ?? [])),
      ]).catch(() => setError("Failed to load")).finally(() => setLoading(false));
    });
  }, [router]);

  const selectedFighter = selectedFighterId ? fighters.find((f) => f.id === selectedFighterId) : fighters[0];
  useEffect(() => {
    if (fighters.length && !selectedFighterId) setSelectedFighterId(fighters[0].id);
  }, [fighters.length, selectedFighterId]);

  const doTraining = async (fighterId: string, stat: string) => {
    if (!session) return;
    const activity = TRAINING_ACTIVITIES.find((a) => a.stat === stat);
    if (!activity) return;
    setUpgrading(`${fighterId}-${stat}`);
    setError(null);
    try {
      const res = await fetch("/api/training/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fighter_id: fighterId, stat }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Training failed");
        return;
      }
      setBalanceCents(data.balance_cents ?? balanceCents ?? 0);
      setFighters((prev) =>
        prev.map((f) => (f.id === fighterId ? { ...f, ...data.fighter } : f))
      );
    } catch {
      setError("Request failed");
    } finally {
      setUpgrading(null);
    }
  };

  if (!session && !loading) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <p className="text-fintech-muted">Redirecting to login…</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
        <p className="text-fintech-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Training Gym</h1>
        <p className="text-sm text-fintech-muted mt-1">
          Train your fighter to improve stats. Each session costs from your wallet.
        </p>
      </div>

      {balanceCents !== null && (
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 px-4 py-3">
          <span className="text-fintech-muted">Wallet balance </span>
          <span className="font-semibold text-fintech-money">{formatCents(balanceCents)}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">{error}</div>
      )}

      {fighters.length === 0 ? (
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 text-center">
          <p className="text-fintech-muted mb-4">You need a fighter to train.</p>
          <Link
            href="/dashboard/my-fighter"
            className="inline-flex items-center justify-center rounded-xl bg-amber-500/90 px-6 py-3 font-semibold text-black hover:bg-amber-400"
          >
            Create fighter
          </Link>
        </div>
      ) : (
        <>
          <div>
            <label className="text-sm text-fintech-muted">Select fighter</label>
            <select
              value={selectedFighterId ?? ""}
              onChange={(e) => setSelectedFighterId(e.target.value || null)}
              className="mt-1 w-full max-w-xs rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
            >
              {fighters.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} — Lv.{f.level} (W{f.wins}/L{f.losses})
                </option>
              ))}
            </select>
          </div>

          {selectedFighter && (
            <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
              <div className="border-b border-white/10 px-6 py-4 bg-gradient-to-r from-amber-500/10 to-transparent">
                <h2 className="text-lg font-bold text-white">{selectedFighter.name}</h2>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <span>Speed {selectedFighter.speed}</span>
                  <span>Power {selectedFighter.power}</span>
                  <span>Defense {selectedFighter.defense}</span>
                  <span>Stamina {selectedFighter.stamina ?? 50}</span>
                  <span className="text-fintech-muted">XP {selectedFighter.experience ?? 0}</span>
                </div>
              </div>
              <div className="p-6 grid gap-4 sm:grid-cols-2">
                {TRAINING_ACTIVITIES.map((act) => {
                  const atMax =
                    (act.stat === "speed" && selectedFighter.speed >= 100) ||
                    (act.stat === "power" && selectedFighter.power >= 100) ||
                    (act.stat === "defense" && selectedFighter.defense >= 100) ||
                    (act.stat === "stamina" && (selectedFighter.stamina ?? 50) >= 100);
                  const canAfford = balanceCents != null && balanceCents >= act.costCents;
                  const busy = upgrading === `${selectedFighter.id}-${act.stat}`;
                  return (
                    <div
                      key={act.id}
                      className="flex flex-col rounded-lg border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{act.icon}</span>
                        <div>
                          <div className="font-medium text-white">{act.label}</div>
                          <div className="text-xs text-fintech-muted">{act.desc} {formatCents(act.costCents)}/session</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={atMax || !canAfford || busy}
                        onClick={() => doTraining(selectedFighter.id, act.stat)}
                        className="mt-3 rounded-lg bg-amber-500/90 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {busy ? "Training…" : atMax ? "Max" : !canAfford ? "Insufficient balance" : "Train"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <div className="rounded-xl border border-white/10 p-4 text-sm text-fintech-muted">
        <strong className="text-white">Tip:</strong> Use the Fight Arena to test your fighter and earn from wins. Entry fees are paid from your wallet; the winner takes the pot.
      </div>
    </div>
  );
}
